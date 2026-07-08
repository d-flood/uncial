import { bytesToBase64, decodeBase64, encodeBase64 } from '../base64.js';
import { MAX_CONTENT_BYTES } from '../constants.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { clearCachedSession, readCachedSession, writeCachedSession } from '../session.js';
import type {
	ForgeAdapter,
	ForgeSession,
	SessionProvider,
	UncialCmsSiteConfig
} from '../types.js';

export const GITHUB_API_URL = 'https://api.github.com';

function encodeRepoPath(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}

class GitHubAdapter implements ForgeAdapter {
	#config: UncialCmsSiteConfig | null = null;
	#provider: SessionProvider | null = null;
	#session: ForgeSession | null = null;

	async authenticate(config: UncialCmsSiteConfig, provider: SessionProvider): Promise<ForgeSession> {
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
		const response = await this.#request(`${this.#contentsUrl(path)}?ref=${this.#config!.branch}`);
		await this.#assertOk(response, `list ${path}`);

		const entries = (await response.json()) as Array<{ path: string; type: string }>;
		if (!Array.isArray(entries)) {
			throw new Error(`Expected a directory but found a file: ${path}`);
		}

		return entries
			.filter((entry) => entry.type === 'file' || entry.type === 'dir')
			.map((entry) => ({ path: entry.path, type: entry.type as 'file' | 'dir' }));
	}

	async commitStatus(commitSha: string): Promise<'pending' | 'success' | 'failure' | 'unknown'> {
		const response = await this.#request(
			`${GITHUB_API_URL}/repos/${this.#config!.repo}/commits/${encodeURIComponent(commitSha)}/status`
		);
		if (!response.ok) return 'unknown';

		const { state } = (await response.json()) as { state?: string };
		if (state === 'pending' || state === 'success') return state;
		if (state === 'failure' || state === 'error') return 'failure';
		return 'unknown';
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
