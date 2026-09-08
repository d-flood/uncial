import { bytesToBase64 } from '../base64.js';
import { ConflictError, NotFoundError } from '../errors.js';
import type {
	ForgeAdapter,
	ForgeSession,
	LocalSiteConfig,
	SessionProvider,
	UncialCmsSiteConfig
} from '../types.js';
import { LOCAL_API_PATH } from './constants.js';

interface ApiError {
	error?: string;
}

function encodePath(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}

class LocalAdapter implements ForgeAdapter {
	#config: LocalSiteConfig | null = null;

	async authenticate(config: UncialCmsSiteConfig, provider: SessionProvider): Promise<ForgeSession> {
		if (config.forge !== 'local') {
			throw new Error('Local adapter requires a local site configuration.');
		}
		this.#config = config;
		return provider(config);
	}

	async readFile(path: string): Promise<{ content: string; sha: string }> {
		return this.#request('POST', `files/${this.#path(path)}`, {});
	}

	async writeFile(
		path: string,
		content: string | Uint8Array,
		opts: { message: string; sha?: string; author: { name: string; email: string } }
	): Promise<{ sha: string; commitSha: string }> {
		return this.#request('PUT', `files/${this.#path(path)}`, {
			content: typeof content === 'string' ? content : bytesToBase64(content),
			...(typeof content === 'string' ? {} : { encoding: 'base64' }),
			// Absent = create or replace outright, as on the GitHub adapter.
			...(opts.sha === undefined ? {} : { sha: opts.sha })
		});
	}

	async deleteFile(path: string, _opts: { message: string; sha: string }): Promise<void> {
		await this.#request('DELETE', `files/${this.#path(path)}`, {});
	}

	async listDir(path: string): Promise<Array<{ path: string; type: 'file' | 'dir' }>> {
		// The plugin roots at the repository, so the paths it reports are already
		// the repo-root-relative ones every forge adapter speaks.
		const response = await this.#request<{ entries: Array<{ path: string; type: 'file' | 'dir' }> }>(
			'POST',
			`dirs/${this.#path(path)}`,
			{}
		);
		return response.entries;
	}

	async commitStatus(_commitSha: string): Promise<'pending' | 'success' | 'failure' | 'unknown'> {
		return 'success';
	}

	/** Repo-root-relative, exactly as the GitHub adapter sends it. */
	#path(path: string): string {
		if (!this.#config) throw new Error('Local adapter is not authenticated; call authenticate() first.');
		return encodePath(path.replace(/^\/+|\/+$/g, ''));
	}

	async #request<T>(method: string, path: string, body: unknown): Promise<T> {
		const response = await fetch(new URL(`${LOCAL_API_PATH}/${path}`, location.origin), {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (response.ok) return (await response.json()) as T;

		const error = (await response.json().catch(() => ({}))) as ApiError;
		if (response.status === 404) throw new NotFoundError(error.error ?? 'File not found.');
		if (response.status === 409) throw new ConflictError(error.error);
		throw new Error(error.error ?? `Local request failed (${response.status}).`);
	}
}

export function createLocalAdapter(): ForgeAdapter {
	return new LocalAdapter();
}
