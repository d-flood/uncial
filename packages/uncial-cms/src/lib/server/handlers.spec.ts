import { describe, expect, it, vi } from 'vitest';
import { ConflictError } from '../errors.js';
import { createServerContentHandlers, type Action, type Authorize, type ServerUser } from './handlers.js';
import type { ContentRecord, ContentStore, VersionSummary } from './postgres-store.js';

const user: ServerUser = { id: 'u1', email: 'ada@example.org', name: 'Ada' };
const doc = { type: 'doc', content: [] };

const record = (): ContentRecord => ({
	id: '1',
	kind: 'page',
	path: 'about',
	draft: doc,
	published: doc,
	etag: 'etag-1',
	publishedAt: new Date('2026-01-01'),
	updatedAt: new Date('2026-01-02'),
	updatedBy: 'ada@example.org'
});

function fakeStore() {
	return {
		get: vi.fn(async (path: string): Promise<ContentRecord | null> => (path === 'elsewhere' ? null : record())),
		list: vi.fn(async () => [record()]),
		create: vi.fn(async () => record()),
		saveDraft: vi.fn(async () => record()),
		publish: vi.fn(async () => record()),
		unpublish: vi.fn(async () => record()),
		delete: vi.fn(async () => {}),
		move: vi.fn(async () => record()),
		versions: vi.fn(async (): Promise<VersionSummary[]> => []),
		getVersion: vi.fn(async () => doc),
		restore: vi.fn(async () => record()),
		publishGlobal: vi.fn(async () => record())
	} satisfies ContentStore;
}

type Store = ReturnType<typeof fakeStore>;
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

function event(method: Method, query: string, body?: unknown) {
	const url = new URL(`http://site.test/dashboard/api/content${query}`);
	const request = new Request(url, {
		method,
		...(body === undefined
			? {}
			: { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
	});
	return { request, url };
}

interface Case {
	action: Action;
	label: string;
	method: Method;
	query?: string;
	body?: unknown;
	/** The store call that performs the action. */
	write: keyof Store;
	/** Whether the handler reads the record to authorize against it. */
	readsRecord: boolean;
}

const cases: Case[] = [
	{ action: 'read-draft', label: 'list', method: 'GET', write: 'list', readsRecord: false },
	{
		action: 'read-draft',
		label: 'get',
		method: 'GET',
		query: '?path=about',
		write: 'get',
		readsRecord: true
	},
	{
		action: 'create',
		label: 'create',
		method: 'POST',
		body: { action: 'create', path: 'new', draft: doc },
		write: 'create',
		readsRecord: false
	},
	{
		action: 'save-draft',
		label: 'save Draft',
		method: 'PUT',
		body: { path: 'about', etag: 'etag-1', draft: doc },
		write: 'saveDraft',
		readsRecord: true
	},
	{
		action: 'publish',
		label: 'publish',
		method: 'POST',
		body: { action: 'publish', path: 'about', etag: 'etag-1' },
		write: 'publish',
		readsRecord: true
	},
	{
		action: 'unpublish',
		label: 'unpublish',
		method: 'POST',
		body: { action: 'unpublish', path: 'about', etag: 'etag-1' },
		write: 'unpublish',
		readsRecord: true
	},
	{
		action: 'read-draft',
		label: 'history',
		method: 'GET',
		query: '?path=about&history',
		write: 'versions',
		readsRecord: true
	},
	{
		action: 'read-draft',
		label: 'version',
		method: 'GET',
		query: '?path=about&version=7',
		write: 'getVersion',
		readsRecord: true
	},
	{
		action: 'restore',
		label: 'restore',
		method: 'POST',
		body: { action: 'restore', path: 'about', versionId: '7', etag: 'etag-1' },
		write: 'restore',
		readsRecord: true
	},
	{
		action: 'move',
		label: 'move',
		method: 'POST',
		body: { action: 'move', path: 'about', to: 'elsewhere', etag: 'etag-1' },
		write: 'move',
		readsRecord: true
	},
	{
		action: 'delete',
		label: 'delete',
		method: 'DELETE',
		body: { path: 'about', etag: 'etag-1' },
		write: 'delete',
		readsRecord: true
	}
];

function setup(authorize: Authorize, currentUser: ServerUser | null = user) {
	const store = fakeStore();
	const spy = vi.fn(authorize);
	const handlers = createServerContentHandlers({ store, authorize: spy, getUser: () => currentUser });
	return { store, authorize: spy, handlers };
}

function storeCalls(store: Store): string[] {
	return Object.entries(store)
		.filter(([, fn]) => fn.mock.calls.length > 0)
		.map(([name]) => name);
}

describe('createServerContentHandlers authorization', () => {
	describe.each(cases)('$label ($action)', (c) => {
		const run = (handlers: ReturnType<typeof setup>['handlers']) =>
			handlers[c.method](event(c.method, c.query ?? '', c.body));

		it('asks authorize for this action and refuses with 403 without touching the store', async () => {
			const { store, authorize, handlers } = setup(() => false);
			const response = await run(handlers);

			expect(response.status).toBe(403);
			expect(authorize).toHaveBeenCalledWith(user, c.action, c.readsRecord ? record() : null);
			// A record-scoped decision reads the record it is about; nothing else runs.
			expect(storeCalls(store)).toEqual(c.readsRecord ? ['get'] : []);
		});

		it('returns 401 and calls neither authorize nor the store when no one is signed in', async () => {
			const { store, authorize, handlers } = setup(() => true, null);
			const response = await run(handlers);

			expect(response.status).toBe(401);
			expect(authorize).not.toHaveBeenCalled();
			expect(storeCalls(store)).toEqual([]);
		});

		it('performs the action once authorize allows it', async () => {
			const { store, handlers } = setup(() => true);
			const response = await run(handlers);

			expect(response.ok).toBe(true);
			expect(store[c.write]).toHaveBeenCalled();
		});
	});

	it('denies only the action authorize refuses', async () => {
		const { store, handlers } = setup((_user, action) => action !== 'publish');
		const denied = await handlers.POST(
			event('POST', '', { action: 'publish', path: 'about', etag: 'etag-1' })
		);
		const allowed = await handlers.PUT(
			event('PUT', '', { path: 'about', etag: 'etag-1', draft: doc })
		);

		expect(denied.status).toBe(403);
		expect(allowed.status).toBe(200);
		expect(store.publish).not.toHaveBeenCalled();
		expect(store.saveDraft).toHaveBeenCalledWith('about', doc, {
			etag: 'etag-1',
			author: user.email
		});
	});
});

describe('createServerContentHandlers responses', () => {
	it.each([
		{ method: 'POST' as const, body: { action: 'create', path: '/_globals/menus/', draft: doc }, write: 'create' as const },
		{ method: 'POST' as const, body: { action: 'create', path: '/menus/', kind: 'global', draft: doc }, write: 'create' as const },
		{ method: 'PUT' as const, body: { path: '/_globals/menus/', draft: doc, etag: 'etag-1' }, write: 'saveDraft' as const },
		{ method: 'POST' as const, body: { action: 'restore', path: '/_globals/menus/', versionId: '7', etag: 'etag-1' }, write: 'restore' as const },
		{ method: 'POST' as const, body: { action: 'unpublish', path: '/_globals/menus/', etag: 'etag-1' }, write: 'unpublish' as const },
		{ method: 'POST' as const, body: { action: 'move', path: '/_globals/menus/', to: 'elsewhere', etag: 'etag-1' }, write: 'move' as const },
		{ method: 'POST' as const, body: { action: 'move', path: 'about', to: '/_globals/menus/', etag: 'etag-1' }, write: 'move' as const }
	])('keeps Globals out of legacy $write mutations: $body', async ({ method, body, write }) => {
		const { store, handlers } = setup(() => true);
		store.get.mockImplementation(async (path) => path === body.path ? record() : null);
		const response = await handlers[method](event(method, '', body));
		expect(response.status).toBe(400);
		expect(store[write]).not.toHaveBeenCalled();
	});

	it('refuses a derived move into the reserved namespace before saving a Draft', async () => {
		const store = fakeStore();
		store.get.mockImplementation(async (path) => path === 'about' ? record() : null);
		const handlers = createServerContentHandlers({
			store,
			authorize: () => true,
			getUser: () => user,
			derivePath: () => '/_globals/menus/'
		});
		const response = await handlers.PUT(event('PUT', '', { path: 'about', draft: doc, etag: 'etag-1' }));
		expect(response.status).toBe(400);
		expect(store.saveDraft).not.toHaveBeenCalled();
		expect(store.move).not.toHaveBeenCalled();
	});

	it('returns the record with its etag and the actions authorize allows', async () => {
		const { handlers } = setup((_user, action) => action === 'read-draft' || action === 'save-draft');
		const response = await handlers.GET(event('GET', '?path=about'));
		const body = await response.json();

		expect(body.etag).toBe('etag-1');
		expect(body.draft).toEqual(doc);
		expect(body.allowed).toEqual(['read-draft', 'save-draft']);
	});

	it('lists records with their Draft/Published status and title', async () => {
		const { store, handlers } = setup(() => true);
		const titled = (title: string) => ({ ...doc, meta: { title } });
		store.list.mockResolvedValue([
			{ ...record(), path: 'a', published: null },
			{ ...record(), path: 'b', draft: null, published: titled('Published B') },
			{ ...record(), path: 'c', draft: titled('Draft C'), published: titled('Published C') }
		]);
		const { records } = await (await handlers.GET(event('GET', ''))).json();

		expect(records.map((r: { status: string }) => r.status)).toEqual(['draft', 'published', 'changed']);
		expect(records.map((r: { title?: string }) => r.title)).toEqual([undefined, 'Published B', 'Draft C']);
	});

	it('creates new records as Drafts of the default kind', async () => {
		const { store, handlers } = setup(() => true);
		const response = await handlers.POST(event('POST', '', { action: 'create', path: 'new', draft: doc }));

		expect(response.status).toBe(201);
		expect(store.create).toHaveBeenCalledWith('new', 'page', doc, { author: user.email });
	});

	it('maps a stale etag to 409', async () => {
		const { store, handlers } = setup(() => true);
		store.saveDraft.mockRejectedValue(new ConflictError());
		const response = await handlers.PUT(event('PUT', '', { path: 'about', etag: 'old', draft: doc }));

		expect(response.status).toBe(409);
	});

	it('returns 404 for a missing record', async () => {
		const { store, handlers } = setup(() => true);
		store.get.mockResolvedValue(null);
		const response = await handlers.GET(event('GET', '?path=missing'));

		expect(response.status).toBe(404);
	});

	it('lists Versions newest first, as the store orders them, with ISO dates', async () => {
		const { store, handlers } = setup(() => true);
		store.versions.mockResolvedValue([
			{ id: '8', createdAt: new Date('2026-02-02T00:00:00Z'), createdBy: 'ada@example.org' },
			{ id: '7', createdAt: new Date('2026-02-01T00:00:00Z'), createdBy: 'bo@example.org' }
		]);
		const body = await (await handlers.GET(event('GET', '?path=about&history'))).json();

		expect(store.versions).toHaveBeenCalledWith('about');
		expect(body).toEqual([
			{ id: '8', createdAt: '2026-02-02T00:00:00.000Z', createdBy: 'ada@example.org' },
			{ id: '7', createdAt: '2026-02-01T00:00:00.000Z', createdBy: 'bo@example.org' }
		]);
	});

	it("returns a Version's document", async () => {
		const { store, handlers } = setup(() => true);
		const body = await (await handlers.GET(event('GET', '?path=about&version=7'))).json();

		expect(store.getVersion).toHaveBeenCalledWith('about', '7');
		expect(body).toEqual(doc);
	});

	it('restores into the Draft without touching the Published copy', async () => {
		const { store, handlers } = setup(() => true);
		const response = await handlers.POST(
			event('POST', '', { action: 'restore', path: 'about', versionId: '7', etag: 'etag-1' })
		);

		expect(response.status).toBe(200);
		expect(store.restore).toHaveBeenCalledWith('about', '7', { etag: 'etag-1', author: user.email });
		expect(storeCalls(store)).toEqual(['get', 'restore']);
	});

	it('requires an etag to restore', async () => {
		const { store, handlers } = setup(() => true);
		const response = await handlers.POST(event('POST', '', { action: 'restore', path: 'about', versionId: '7' }));

		expect(response.status).toBe(400);
		expect(store.restore).not.toHaveBeenCalled();
	});

	describe('a Draft whose derived path changes', () => {
		const derivePath = (_kind: string, draft: unknown) => (draft as { path?: string }).path ?? null;
		const moving = (authorize: Authorize) => {
			const store = fakeStore();
			store.get.mockImplementation(async (path: string) =>
				path === 'about' ? record() : (null as unknown as ContentRecord)
			);
			store.saveDraft.mockResolvedValue({ ...record(), etag: 'etag-2' });
			store.move.mockResolvedValue({ ...record(), path: 'renamed', etag: 'etag-3' });
			const handlers = createServerContentHandlers({ store, authorize, getUser: () => user, derivePath });
			const save = () => handlers.PUT(event('PUT', '', { path: 'about', etag: 'etag-1', draft: { path: 'renamed' } }));
			return { store, save };
		};

		it('saves, then moves the record to it', async () => {
			const { store, save } = moving(() => true);
			const response = await save();

			expect(response.status).toBe(200);
			expect((await response.json()).path).toBe('renamed');
			expect(store.move).toHaveBeenCalledWith('about', 'renamed', { etag: 'etag-2', author: user.email });
		});

		it('refuses before saving when authorize denies move', async () => {
			const { store, save } = moving((_user, action) => action !== 'move');
			const response = await save();

			expect(response.status).toBe(403);
			expect(store.saveDraft).not.toHaveBeenCalled();
		});

		it('refuses before saving when the path is taken', async () => {
			const { store, save } = moving(() => true);
			store.get.mockResolvedValue(record());
			const response = await save();

			expect(response.status).toBe(400);
			expect(store.saveDraft).not.toHaveBeenCalled();
		});
	});

	describe('moving a record', () => {
		const move = (to: string, opts: Partial<Parameters<typeof createServerContentHandlers>[0]> = {}) => {
			const store = fakeStore();
			const handlers = createServerContentHandlers({ store, authorize: () => true, getUser: () => user, ...opts });
			const response = handlers.POST(event('POST', '', { action: 'move', path: 'about', to, etag: 'etag-1' }));
			return { store, response };
		};

		it('moves the record to the normalized path', async () => {
			const { store, response } = move('Elsewhere', { normalizePath: (path) => path.toLowerCase() });

			expect((await response).status).toBe(200);
			expect(store.move).toHaveBeenCalledWith('about', 'elsewhere', { etag: 'etag-1', author: user.email });
		});

		it.each([
			['a path the host refuses', 'elsewhere', { normalizePath: () => null }],
			['a taken path', 'taken', {}],
			['its own path', 'about', {}],
			['a record whose path the host derives', 'elsewhere', { derivePath: () => 'derived' }]
		])('refuses %s', async (_label, to, opts) => {
			const { store, response } = move(to, opts);

			expect((await response).status).toBe(400);
			expect(store.move).not.toHaveBeenCalled();
		});
	});

	it('reports the signed-in user for the session probe', async () => {
		const { store, handlers } = setup(() => true);
		const body = await (await handlers.GET(event('GET', '?session'))).json();

		expect(body.user).toEqual(user);
		expect(storeCalls(store)).toEqual([]);
	});
});
