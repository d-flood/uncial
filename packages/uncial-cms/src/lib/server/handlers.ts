import { ConflictError, NotFoundError } from '../errors.js';
import {
	ACTIONS,
	contentStatus,
	type Action,
	type ContentSummary,
	type MediaListView,
	type ServerUser,
	type VersionView
} from '../server-forge/protocol.js';
import { MediaInUseError, type MediaLibrary } from './media.js';
import type { ContentRecord, ContentStore } from './postgres-store.js';

export type { Action, ServerUser };

export type Authorize = (
	user: ServerUser | null,
	action: Action,
	record: ContentRecord | null
) => boolean | Promise<boolean>;

interface ContentRequestEvent {
	request: Request;
	url: URL;
}

export interface ServerContentHandlerOptions<Event extends ContentRequestEvent> {
	store: ContentStore;
	authorize: Authorize;
	getUser: (event: Event) => ServerUser | null | Promise<ServerUser | null>;
	/**
	 * The path a record of this kind belongs at, given its Draft, when the host
	 * derives paths from metadata. Saving a Draft that derives a new path moves
	 * the record there, which `authorize` must also grant as `move`.
	 */
	derivePath?: (kind: string, draft: unknown) => string | null;
}

type Handler<Event> = (event: Event) => Promise<Response>;

class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

function failure(error: unknown): Response {
	if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
	if (error instanceof MediaInUseError) {
		return Response.json({ error: error.message, usage: error.usage }, { status: 409 });
	}
	if (error instanceof ConflictError) return Response.json({ error: error.message }, { status: 409 });
	if (error instanceof NotFoundError) return Response.json({ error: error.message }, { status: 404 });
	throw error;
}

async function body(request: Request): Promise<Record<string, unknown>> {
	const parsed = await request.json().catch(() => null);
	if (parsed === null || typeof parsed !== 'object') throw new HttpError(400, 'Expected a JSON body.');
	return parsed as Record<string, unknown>;
}

function text(value: unknown, name: string): string {
	if (typeof value !== 'string') throw new HttpError(400, `Expected a string "${name}".`);
	return value;
}

function summary(record: ContentRecord): ContentSummary {
	return {
		path: record.path,
		kind: record.kind,
		status: contentStatus(record.draft !== null, record.published !== null),
		publishedAt: record.publishedAt?.toISOString() ?? null,
		updatedAt: record.updatedAt.toISOString(),
		updatedBy: record.updatedBy
	};
}

/**
 * The SvelteKit `+server.ts` exports for a `server` forge's `apiBase`. The
 * record path travels in the query (GET) or the JSON body, so one route serves
 * every Content document, the site root included.
 */
export function createServerContentHandlers<Event extends ContentRequestEvent>(
	opts: ServerContentHandlerOptions<Event>
): { GET: Handler<Event>; POST: Handler<Event>; PUT: Handler<Event>; DELETE: Handler<Event> } {
	const { store, authorize } = opts;

	const handle =
		(fn: (event: Event, user: ServerUser) => Promise<Response>): Handler<Event> =>
		async (event) => {
			try {
				const user = await opts.getUser(event);
				if (!user) throw new HttpError(401, 'You are signed out. Sign in again to continue.');
				return await fn(event, user);
			} catch (error) {
				return failure(error);
			}
		};

	async function guard(user: ServerUser, action: Action, record: ContentRecord | null) {
		if (!(await authorize(user, action, record))) {
			throw new HttpError(403, `You do not have permission to ${action.replace('-', ' ')}.`);
		}
	}

	// Record-scoped decisions need the record, so this read precedes `guard`;
	// no write reaches the store until `guard` passes.
	async function existing(path: string): Promise<ContentRecord> {
		const record = await store.get(path);
		if (!record) throw new HttpError(404, `No content at ${path}.`);
		return record;
	}

	async function view(user: ServerUser, record: ContentRecord, status = 200): Promise<Response> {
		const allowed: Action[] = [];
		for (const action of ACTIONS) {
			if (await authorize(user, action, record)) allowed.push(action);
		}
		return Response.json({ ...record, allowed }, { status });
	}

	return {
		GET: handle(async ({ url }, user) => {
			if (url.searchParams.has('session')) return Response.json({ user });
			const path = url.searchParams.get('path');
			if (path === null) {
				await guard(user, 'read-draft', null);
				const kind = url.searchParams.get('kind') ?? undefined;
				return Response.json({ records: (await store.list({ kind })).map(summary) });
			}
			const record = await store.get(path);
			await guard(user, 'read-draft', record);
			if (!record) throw new HttpError(404, `No content at ${path}.`);
			if (url.searchParams.has('history')) {
				const versions: VersionView[] = (await store.versions(path)).map((version) => ({
					id: version.id,
					createdAt: version.createdAt.toISOString(),
					createdBy: version.createdBy
				}));
				return Response.json(versions);
			}
			const versionId = url.searchParams.get('version');
			if (versionId !== null) return Response.json(await store.getVersion(path, versionId));
			return view(user, record);
		}),

		POST: handle(async ({ request }, user) => {
			const input = await body(request);
			const path = text(input.path, 'path');
			if (input.action === 'create') {
				await guard(user, 'create', null);
				const kind = input.kind === undefined ? 'page' : text(input.kind, 'kind');
				return view(user, await store.create(path, kind, input.draft, { author: user.email }), 201);
			}
			if (input.action === 'publish' || input.action === 'unpublish') {
				const record = await existing(path);
				await guard(user, input.action, record);
				const write = { etag: text(input.etag, 'etag'), author: user.email };
				if (input.action === 'unpublish') return view(user, await store.unpublish(path, write));
				if (record.draft === null) throw new HttpError(400, `Nothing to publish: ${path} has no Draft.`);
				return view(user, await store.publish(path, write));
			}
			if (input.action === 'restore') {
				const record = await existing(path);
				await guard(user, 'restore', record);
				const versionId = text(input.versionId, 'versionId');
				const write = { etag: text(input.etag, 'etag'), author: user.email };
				return view(user, await store.restore(path, versionId, write));
			}
			throw new HttpError(400, 'Expected "action" to be create, publish, unpublish or restore.');
		}),

		PUT: handle(async ({ request }, user) => {
			const input = await body(request);
			const path = text(input.path, 'path');
			const record = await existing(path);
			await guard(user, 'save-draft', record);
			const etag = text(input.etag, 'etag');
			const target = opts.derivePath?.(record.kind, input.draft) ?? path;
			if (target !== path) {
				await guard(user, 'move', record);
				if (await store.get(target)) {
					throw new HttpError(400, `Something else is already at ${target}. Choose another path.`);
				}
			}
			const saved = await store.saveDraft(path, input.draft, { etag, author: user.email });
			if (target === path) return view(user, saved);
			return view(user, await store.move(path, target, { etag: saved.etag, author: user.email }));
		}),

		DELETE: handle(async ({ request }, user) => {
			const input = await body(request);
			const path = text(input.path, 'path');
			await guard(user, 'delete', await existing(path));
			await store.delete(path, { etag: text(input.etag, 'etag'), author: user.email });
			return new Response(null, { status: 204 });
		})
	};
}

export interface ServerMediaHandlerOptions<Event extends ContentRequestEvent> {
	library: MediaLibrary;
	authorize: Authorize;
	getUser: (event: Event) => ServerUser | null | Promise<ServerUser | null>;
}

const MEDIA_ACTIONS: Action[] = ['media-upload', 'media-delete'];

/** The SvelteKit `+server.ts` exports for a `server` forge's `mediaApiBase`. */
export function createServerMediaHandlers<Event extends ContentRequestEvent>(
	opts: ServerMediaHandlerOptions<Event>
): { GET: Handler<Event>; POST: Handler<Event>; DELETE: Handler<Event> } {
	const { library, authorize } = opts;

	const handle =
		(action: Action, fn: (event: Event, user: ServerUser) => Promise<Response>): Handler<Event> =>
		async (event) => {
			try {
				const user = await opts.getUser(event);
				if (!user) throw new HttpError(401, 'You are signed out. Sign in again to continue.');
				if (!(await authorize(user, action, null))) {
					throw new HttpError(403, `You do not have permission to ${action.replace('-', ' ')}.`);
				}
				return await fn(event, user);
			} catch (error) {
				return failure(error);
			}
		};

	return {
		GET: handle('read-draft', async ({ url }, user) => {
			const items = await library.list({
				search: url.searchParams.get('search') || undefined,
				contentType: url.searchParams.get('contentType') || undefined
			});
			const allowed: Action[] = [];
			for (const action of MEDIA_ACTIONS) {
				if (await authorize(user, action, null)) allowed.push(action);
			}
			const view: MediaListView = {
				items: items.map((item) => ({ ...item, uploadedAt: item.uploadedAt.toISOString() })),
				allowed
			};
			return Response.json(view);
		}),

		POST: handle('media-upload', async ({ request }, user) => {
			const form = await request.formData().catch(() => null);
			const file = form?.get('file');
			if (!(file instanceof File)) throw new HttpError(400, 'Expected a multipart "file".');
			const title = form?.get('title');
			const item = await library.upload(new Uint8Array(await file.arrayBuffer()), {
				filename: file.name,
				title: typeof title === 'string' ? title : undefined,
				contentType: file.type || 'application/octet-stream',
				uploadedBy: user.email
			});
			return Response.json(item, { status: 201 });
		}),

		DELETE: handle('media-delete', async ({ request }) => {
			const id = text((await body(request)).id, 'id');
			await library.delete(id);
			return new Response(null, { status: 204 });
		})
	};
}
