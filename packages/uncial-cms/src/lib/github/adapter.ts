import { bytesToBase64, decodeBase64, encodeBase64 } from '../base64.js';
import { MAX_CONTENT_BYTES } from '../constants.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { clearCachedSession, readCachedSession, writeCachedSession } from '../session.js';
import type {
	ForgeAdapter,
	ForgeSession,
	GitHubSiteConfig,
	SessionProvider,
	UncialCmsSiteConfig
} from '../types.js';

export const GITHUB_API_URL = 'https://api.github.com';

function encodeRepoPath(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}

class GitHubAdapter implements ForgeAdapter {
	#config: GitHubSiteConfig | null = null;
	#provider: SessionProvider | null = null;
	#session: ForgeSession | null = null;

	async authenticate(config: UncialCmsSiteConfig, provider: SessionProvider): Promise<ForgeSession> {
		if (config.forge !== 'github') {
			throw new Error('GitHub adapter requires a GitHub site configuration.');
		}
		this.#config = config;
		this.#provider = provider;
		this.#session = readCachedSession(config.repo) ?? (await this.#renewSession());
		return this.#session;
	}

	async readFile(path: string): Promise<{ content: string; sha: string }> {
		const response = await this.#request(`${this.#contentsUrl(path)}?ref=${this.#config!.branch}`);
		if (response.status === 404) {
			throw new NotFoundError(
				`File not found in ${this.#config!.repo}@${this.#config!.branch}: ${path}`
			);
		}
		await this.#assertOk(response, `read ${path}`);

		const file = (await response.json()) as {
			content?: string;
			encoding?: string;
			sha: string;
			size?: number;
		};
		if (Array.isArray(file)) {
			throw new Error(`Expected a file but found a directory: ${path}`);
		}
		if (file.encoding !== 'base64' || (file.size ?? 0) > MAX_CONTENT_BYTES) {
			throw new Error(
				`Document ${path} exceeds the 1 MB limit of the GitHub Contents API and cannot be edited.`
			);
		}

		return { content: decodeBase64(file.content ?? ''), sha: file.sha };
	}

	async writeFile(
		path: string,
		content: string | Uint8Array,
		opts: { message: string; sha?: string; author: { name: string; email: string } }
	): Promise<{ sha: string; commitSha: string }> {
		const response = await this.#request(this.#contentsUrl(path), {
			method: 'PUT',
			body: JSON.stringify({
				message: opts.message,
				content: typeof content === 'string' ? encodeBase64(content) : bytesToBase64(content),
				branch: this.#config!.branch,
				...(opts.sha === undefined ? {} : { sha: opts.sha }),
				author: opts.author
			})
		});
		if (response.status === 409) throw new ConflictError();
		await this.#assertOk(response, `write ${path}`);

		const result = (await response.json()) as { content: { sha: string }; commit: { sha: string } };
		return { sha: result.content.sha, commitSha: result.commit.sha };
	}

	async deleteFile(path: string, opts: { message: string; sha: string }): Promise<void> {
		const response = await this.#request(this.#contentsUrl(path), {
			method: 'DELETE',
			body: JSON.stringify({
				message: opts.message,
				sha: opts.sha,
				branch: this.#config!.branch
			})
		});
		if (response.status === 409) throw new ConflictError();
		await this.#assertOk(response, `delete ${path}`);
	}

	async listDir(path: string): Promise<Array<{ path: string; type: 'file' | 'dir' }>> {
		// The Trees API, unlike the Contents API, has no 1,000-entry directory cap.
		const dir = path.replace(/^\/+|\/+$/g, '');
		const ref = `${this.#config!.branch}:${encodeRepoPath(dir)}`;
		// GitHub marks this `private, max-age=60`, so the browser would otherwise
		// answer from its cache and omit a file committed within the last minute.
		const response = await this.#request(
			`${GITHUB_API_URL}/repos/${this.#config!.repo}/git/trees/${ref}`,
			{ cache: 'no-cache' }
		);
		await this.#assertOk(response, `list ${path}`);

		const body = (await response.json()) as {
			tree?: Array<{ path: string; type: string }>;
			truncated?: boolean;
		};
		if (!Array.isArray(body.tree)) {
			throw new Error(`Expected a directory but found a file: ${path}`);
		}
		if (body.truncated) {
			throw new Error(`Directory is too large to list: ${path}`);
		}

		// Tree entry paths are relative to the listed directory; callers expect repo-root-relative.
		const prefix = dir ? `${dir}/` : '';
		const kinds: Record<string, 'file' | 'dir'> = { blob: 'file', tree: 'dir' };
		return body.tree
			.filter((entry) => entry.type in kinds)
			.map((entry) => ({ path: prefix + entry.path, type: kinds[entry.type]! }));
	}

	/**
	 * Both of GitHub's two answers to "how did this commit fare", because a repo
	 * may use either.
	 *
	 * ⚠ The combined Status API aggregates the *Status* API alone, and GitHub
	 * Actions writes **check runs**, not statuses. A repository built by Actions
	 * — which is every Pages site deployed from a workflow — therefore has
	 * `state: "pending"` and an empty `statuses` array on that endpoint for
	 * ever, and a poll that trusted it would sit at "building…" through a deploy
	 * that has already succeeded. So an empty `statuses` is read as *no signal*
	 * rather than as pending, and the check runs are asked as well.
	 */
	async commitStatus(commitSha: string): Promise<'pending' | 'success' | 'failure' | 'unknown'> {
		const sha = encodeURIComponent(commitSha);
		const base = `${GITHUB_API_URL}/repos/${this.#config!.repo}/commits/${sha}`;
		const [fromStatuses, fromChecks] = await Promise.all([
			this.#statusApiSignal(`${base}/status`),
			this.#checkRunSignal(`${base}/check-runs`)
		]);

		const signals = [fromStatuses, fromChecks].filter((signal) => signal !== 'unknown');
		if (signals.includes('failure')) return 'failure';
		if (signals.includes('pending')) return 'pending';
		return signals.includes('success') ? 'success' : 'unknown';
	}

	async #statusApiSignal(url: string): Promise<'pending' | 'success' | 'failure' | 'unknown'> {
		const response = await this.#request(url);
		if (!response.ok) return 'unknown';

		const { state, statuses } = (await response.json()) as {
			state?: string;
			statuses?: unknown[];
		};
		if ((statuses ?? []).length === 0) return 'unknown';
		if (state === 'pending' || state === 'success') return state;
		if (state === 'failure' || state === 'error') return 'failure';
		return 'unknown';
	}

	async #checkRunSignal(url: string): Promise<'pending' | 'success' | 'failure' | 'unknown'> {
		const response = await this.#request(url);
		if (!response.ok) return 'unknown';

		const { check_runs: runs } = (await response.json()) as {
			check_runs?: Array<{ status?: string; conclusion?: string | null }>;
		};
		if (!runs || runs.length === 0) return 'unknown';

		let pending = false;
		let success = false;
		for (const run of runs) {
			if (run.status !== 'completed') {
				pending = true;
				continue;
			}
			switch (run.conclusion) {
				case 'success':
				case 'neutral':
				case 'skipped':
					success = true;
					break;
				// A run superseded by a later one says nothing about this commit.
				case 'stale':
					break;
				default:
					return 'failure';
			}
		}
		if (pending) return 'pending';
		return success ? 'success' : 'unknown';
	}

	#contentsUrl(path: string): string {
		return `${GITHUB_API_URL}/repos/${this.#config!.repo}/contents/${encodeRepoPath(path)}`;
	}

	async #renewSession(): Promise<ForgeSession> {
		const session = await this.#provider!(this.#config!);
		writeCachedSession(session);
		return session;
	}

	async #request(url: string, init: RequestInit = {}): Promise<Response> {
		const response = await this.#send(url, init);
		if (response.status !== 401) return response;

		// Expired/revoked token: clear the session, re-invoke the provider, retry once.
		clearCachedSession(this.#config!.repo);
		this.#session = await this.#renewSession();
		return this.#send(url, init);
	}

	async #send(url: string, init: RequestInit): Promise<Response> {
		if (!this.#config || !this.#session) {
			throw new Error('GitHub adapter is not authenticated; call authenticate() first.');
		}
		return fetch(url, {
			...init,
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${this.#session.token}`,
				'X-GitHub-Api-Version': '2022-11-28',
				...init.headers
			}
		});
	}

	async #assertOk(response: Response, action: string): Promise<void> {
		if (response.ok) return;
		let detail = '';
		try {
			detail = ((await response.json()) as { message?: string }).message ?? '';
		} catch {
			// Non-JSON error body; the status code is enough.
		}
		throw new Error(
			`GitHub request failed (${response.status}) while trying to ${action}${detail ? `: ${detail}` : ''}`
		);
	}
}

export function createGitHubAdapter(): ForgeAdapter {
	return new GitHubAdapter();
}
