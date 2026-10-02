import { ConflictError, NotFoundError } from '../errors.js';
import type {
	ForgeAdapter,
	ForgeSession,
	ServerSiteConfig,
	SessionProvider,
	UncialCmsSiteConfig
} from '../types.js';
import type { ContentSummary, ContentView, VersionView } from './protocol.js';

export interface ServerForgeAdapter extends ForgeAdapter {
	getRecord(path: string): Promise<ContentView>;
	list(): Promise<ContentSummary[]>;
	publish(path: string, etag: string): Promise<ContentView>;
	unpublish(path: string, etag: string): Promise<ContentView>;
	versions(path: string): Promise<VersionView[]>;
	getVersion(path: string, versionId: string): Promise<unknown>;
	restore(path: string, versionId: string, etag: string): Promise<ContentView>;
}

export async function serverRequest<T>(
	apiBase: string,
	method: string,
	opts: { query?: Record<string, string>; body?: unknown } = {}
): Promise<T> {
	const url = new URL(apiBase, location.origin);
	for (const [key, value] of Object.entries(opts.query ?? {})) url.searchParams.set(key, value);
	const response = await fetch(url, {
		method,
		credentials: 'same-origin',
		...(opts.body === undefined
			? {}
			: opts.body instanceof FormData
				? { body: opts.body }
				: { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts.body) })
	});
	if (response.status === 204) return undefined as T;
	if (response.ok) return (await response.json()) as T;

	const { error } = (await response.json().catch(() => ({}))) as { error?: string };
	if (response.status === 401) throw new Error('You are signed out. Sign in again to keep editing.');
	if (response.status === 403) throw new Error(error ?? 'You do not have permission to do that.');
	if (response.status === 404) throw new NotFoundError(error);
	if (response.status === 409) throw new ConflictError(error);
	throw new Error(error ?? `Request failed (${response.status}).`);
}

class ServerAdapter implements ServerForgeAdapter {
	#config: ServerSiteConfig | null = null;

	async authenticate(config: UncialCmsSiteConfig, provider: SessionProvider): Promise<ForgeSession> {
		if (config.forge !== 'server') {
			throw new Error('Server adapter requires a server site configuration.');
		}
		this.#config = config;
		return provider(config);
	}

	getRecord(path: string): Promise<ContentView> {
		return this.#request('GET', { query: { path } });
	}

	async list(): Promise<ContentSummary[]> {
		const { records } = await this.#request<{ records: ContentSummary[] }>('GET');
		return records;
	}

	publish(path: string, etag: string): Promise<ContentView> {
		return this.#request('POST', { body: { action: 'publish', path, etag } });
	}

	unpublish(path: string, etag: string): Promise<ContentView> {
		return this.#request('POST', { body: { action: 'unpublish', path, etag } });
	}

	versions(path: string): Promise<VersionView[]> {
		return this.#request('GET', { query: { path, history: '' } });
	}

	getVersion(path: string, versionId: string): Promise<unknown> {
		return this.#request('GET', { query: { path, version: versionId } });
	}

	restore(path: string, versionId: string, etag: string): Promise<ContentView> {
		return this.#request('POST', { body: { action: 'restore', path, versionId, etag } });
	}

	async readFile(path: string): Promise<{ content: string; sha: string }> {
		const record = await this.getRecord(path);
		return { content: JSON.stringify(record.draft ?? record.published), sha: record.etag };
	}

	async writeFile(
		path: string,
		content: string | Uint8Array,
		opts: { message: string; sha?: string; author: { name: string; email: string } }
	): Promise<{ sha: string; commitSha: string; path: string }> {
		if (typeof content !== 'string') {
			throw new Error('The server forge stores Content documents only; upload media separately.');
		}
		const draft = JSON.parse(content) as unknown;
		const record: ContentView =
			opts.sha === undefined
				? await this.#request('POST', { body: { action: 'create', path, draft } })
				: await this.#request('PUT', { body: { path, draft, etag: opts.sha } });
		return { sha: record.etag, commitSha: '', path: record.path };
	}

	async deleteFile(path: string, opts: { message: string; sha: string }): Promise<void> {
		await this.#request('DELETE', { body: { path, etag: opts.sha } });
	}

	async listDir(): Promise<Array<{ path: string; type: 'file' | 'dir' }>> {
		throw new Error('The server forge has no directories; list Content documents with list().');
	}

	async commitStatus(): Promise<'pending' | 'success' | 'failure' | 'unknown'> {
		return 'success';
	}

	#request<T>(method: string, opts?: { query?: Record<string, string>; body?: unknown }): Promise<T> {
		if (!this.#config) throw new Error('Server adapter is not authenticated; call authenticate() first.');
		return serverRequest(this.#config.apiBase, method, opts);
	}
}

export function createServerAdapter(): ServerForgeAdapter {
	return new ServerAdapter();
}
