import { describe, expect, it, vi } from 'vitest';
import { ConflictError } from '../errors.js';
import { createServerContentHandlers, type Action, type Authorize, type ServerUser } from './handlers.js';
import type { ContentRecord, ContentStore } from './postgres-store.js';

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
		get: vi.fn(async () => record()),
		list: vi.fn(async () => [record()]),
		create: vi.fn(async () => record()),
		saveDraft: vi.fn(async () => record()),
		publish: vi.fn(async () => record()),
		unpublish: vi.fn(async () => record()),
		delete: vi.fn(async () => {}),
		move: vi.fn(async () => record()),
		versions: vi.fn(async () => []),
		getVersion: vi.fn(async () => doc),
		restore: vi.fn(async () => record())
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
	it('returns the record with its etag and the actions authorize allows', async () => {
		const { handlers } = setup((_user, action) => action === 'read-draft' || action === 'save-draft');
		const response = await handlers.GET(event('GET', '?path=about'));
		const body = await response.json();

		expect(body.etag).toBe('etag-1');
		expect(body.draft).toEqual(doc);
		expect(body.allowed).toEqual(['read-draft', 'save-draft']);
	});

	it('lists records with their Draft/Published status', async () => {
		const { store, handlers } = setup(() => true);
		store.list.mockResolvedValue([
			{ ...record(), path: 'a', published: null },
			{ ...record(), path: 'b', draft: null },
			{ ...record(), path: 'c' }
		]);
		const { records } = await (await handlers.GET(event('GET', ''))).json();

		expect(records.map((r: { status: string }) => r.status)).toEqual(['draft', 'published', 'changed']);
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
		store.get.mockResolvedValue(null as unknown as ContentRecord);
		const response = await handlers.GET(event('GET', '?path=missing'));

		expect(response.status).toBe(404);
	});

	it('reports the signed-in user for the session probe', async () => {
		const { store, handlers } = setup(() => true);
		const body = await (await handlers.GET(event('GET', '?session'))).json();

		expect(body.user).toEqual(user);
		expect(storeCalls(store)).toEqual([]);
	});
});
