import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlockRegistry, createSchema, normalizeDocument } from 'uncial/core';
import { defineSite } from './define-site.js';
import { createEditorSession } from './editor-session.js';
import type { Schedule } from './deploy-status.js';
import type { EditorPageUi } from './editor-controller.js';
import type { ForgeSession } from './types.js';

const blocks = createBlockRegistry([]);
const schema = createSchema(blocks, {
	metaFields: { title: { default: 'Untitled', required: true } }
});

const session: ForgeSession = {
	token: 'test-token',
	expiresAt: null,
	repo: 'octo/site',
	user: { login: 'octocat', name: 'Octo Cat', email: 'octo@users.noreply.github.com' }
};

function docWith(text: string) {
	return normalizeDocument(
		{
			type: 'doc',
			content: [
				{ type: 'paragraph', attrs: { id: `paragraph-${text}` }, content: [{ type: 'text', text }] }
			]
		},
		blocks,
		schema
	);
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockImplementation(async (input, init) => {
		if (init?.method === 'PUT') {
			return jsonResponse({ content: { sha: 'sha-2' }, commit: { sha: 'commitdeadbeef' } });
		}
		if (String(input).includes('/contents/')) {
			return jsonResponse({
				content: Buffer.from(JSON.stringify(docWith('original')), 'utf-8').toString('base64'),
				encoding: 'base64',
				sha: 'sha-1',
				size: 64
			});
		}
		return jsonResponse({ state: 'pending', statuses: [] });
	});
});

afterEach(() => {
	fetchMock.mockReset();
	vi.unstubAllGlobals();
});

const ui: EditorPageUi = {
	status: () => {},
	setDocument: () => {},
	saveEnabled: () => {},
	conflictVisible: () => {}
};

describe('createEditorSession — deploy-status timings', () => {
	it('polls on the cadence the site options declare rather than the defaults', async () => {
		const site = defineSite(
			{
				contentDir: 'content',
				github: { repo: 'octo/site', branch: 'main' },
				// A twenty-minute pipeline: the default five-minute deadline would
				// end every save on "status unknown".
				deployStatus: { firstDelayMs: 30_000, intervalMs: 60_000, timeoutMs: 20 * 60_000 }
			},
			{ dev: false }
		);
		const delays: number[] = [];
		const schedule: Schedule = (_fn, ms) => {
			delays.push(ms);
			return () => {};
		};

		const controller = createEditorSession({
			config: site.config,
			sourcePath: 'content/about.json',
			blocks,
			schema,
			ui,
			sessionProvider: async () => session,
			timings: site.deployStatusTimings,
			schedule
		});
		await controller.load();
		controller.documentChanged(docWith('edited'));
		await controller.save();

		// The deadline and the first poll, in the order polling schedules them.
		expect(delays).toEqual([20 * 60_000, 30_000]);
	});

	it('leaves the defaults in place for a site that declares no timings', async () => {
		const site = defineSite(
			{ contentDir: 'content', github: { repo: 'octo/site', branch: 'main' } },
			{ dev: false }
		);

		expect(site.deployStatusTimings).toEqual({
			firstDelayMs: 3_000,
			intervalMs: 10_000,
			timeoutMs: 5 * 60_000
		});
	});
});
