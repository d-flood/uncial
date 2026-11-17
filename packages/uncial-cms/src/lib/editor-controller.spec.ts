import { describe, expect, it, vi } from 'vitest';
import { createContentModel, normalizeDocument } from 'uncial';
import type { ContentDocument } from 'uncial';
import { serializeDocument } from './document.js';
import {
	createEditorController,
	type EditorControllerOptions,
	type EditorPageUi
} from './editor-controller.js';
import type { Schedule } from './deploy-status.js';
import type { ForgeAdapter, ForgeSession, UncialCmsSiteConfig } from './types.js';

const model = createContentModel({
	blocks: [],
	meta: { title: { default: 'Untitled', required: true } }
});
const blocks = model.blocks;
const schema = model.schemaFor();

const config: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'octo/site',
	branch: 'main',
	contentDir: 'content',
	authWorkerUrl: '',
	appSlug: 'uncial-cms'
};

const session: ForgeSession = {
	token: 't',
	expiresAt: null,
	repo: 'octo/site',
	user: { login: 'octocat', name: 'Octo Cat', email: 'octo@users.noreply.github.com' }
};

function docWith(text: string): ContentDocument {
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

const ui: EditorPageUi = {
	status: () => {},
	setDocument: () => {},
	saveEnabled: () => {},
	conflictVisible: () => {}
};

/**
 * A hand-driven clock. Deploy polling and autosave share the injected
 * scheduler, so tasks are recorded with their delay and fired by delay rather
 * than all at once — firing everything would run a poll the test never asked
 * for.
 */
function fakeClock() {
	const tasks: Array<{ ms: number; fn: () => void; cancelled: boolean }> = [];
	const schedule: Schedule = (fn, ms) => {
		const task = { ms, fn, cancelled: false };
		tasks.push(task);
		return () => {
			task.cancelled = true;
		};
	};
	const fire = (ms: number) => {
		const due = tasks.filter((task) => task.ms === ms && !task.cancelled);
		for (const task of due) {
			task.cancelled = true;
			task.fn();
		}
		return due.length;
	};
	return { schedule, fire, pending: () => tasks.filter((task) => !task.cancelled).length };
}

function harness(overrides: {
	adapter?: Partial<ForgeAdapter>;
	autosaveMs?: number;
	schedule?: Schedule;
	schemaFor?: EditorControllerOptions['schemaFor'];
}) {
	const loaded = docWith('original');
	const adapter: ForgeAdapter = {
		authenticate: vi.fn().mockResolvedValue(session),
		readFile: vi.fn().mockResolvedValue({ content: JSON.stringify(loaded), sha: 'sha-1' }),
		writeFile: vi.fn().mockResolvedValue({ sha: 'sha-2', commitSha: 'commitdeadbeef' }),
		deleteFile: vi.fn(),
		listDir: vi.fn(),
		commitStatus: vi.fn().mockResolvedValue('unknown'),
		...overrides.adapter
	};
	const options: EditorControllerOptions = {
		config,
		sourcePath: 'content/about.json',
		blocks,
		schemaFor: overrides.schemaFor ?? model.schemaFor,
		adapter,
		sessionProvider: vi.fn().mockResolvedValue(session),
		ui,
		confirm: () => true,
		download: vi.fn(),
		autosaveMs: overrides.autosaveMs,
		// Never-firing scheduler by default: deploy polling stays inert in these
		// unit tests.
		schedule: overrides.schedule ?? (() => () => {})
	};
	const controller = createEditorController(options);
	return { controller, adapter };
}

describe('createEditorController — debounced autosave', () => {
	it('does not save on a change when no autosave interval is set', async () => {
		const clock = fakeClock();
		const { controller, adapter } = harness({ schedule: clock.schedule });
		await controller.load();

		controller.documentChanged(docWith('typed'));

		expect(clock.pending()).toBe(0);
		expect(adapter.writeFile).not.toHaveBeenCalled();
	});

	it('saves the last change once when several land inside the debounce window', async () => {
		const clock = fakeClock();
		const writeFile = vi.fn().mockResolvedValue({ sha: 'sha-2', commitSha: 'commit' });
		const { controller } = harness({
			adapter: { writeFile },
			autosaveMs: 400,
			schedule: clock.schedule
		});
		await controller.load();

		controller.documentChanged(docWith('t'));
		controller.documentChanged(docWith('ty'));
		controller.documentChanged(docWith('typed'));
		expect(writeFile).not.toHaveBeenCalled(); // still waiting

		expect(clock.fire(400)).toBe(1); // one timer, not three
		await vi.waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));
		expect(writeFile.mock.calls[0]![1]).toBe(serializeDocument(docWith('typed'), blocks, schema));
		expect(controller.isDirty()).toBe(false);
	});

	it('coalesces a change that lands mid-save into a single follow-up save', async () => {
		const clock = fakeClock();
		let release: (() => void) | undefined;
		const writeFile = vi.fn().mockImplementation(
			() =>
				new Promise((resolve) => {
					release = () => resolve({ sha: 'sha-2', commitSha: 'commit' });
				})
		);
		const { controller } = harness({
			adapter: { writeFile },
			autosaveMs: 400,
			schedule: clock.schedule
		});
		await controller.load();

		controller.documentChanged(docWith('first'));
		clock.fire(400);
		await vi.waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));

		controller.documentChanged(docWith('second'));
		clock.fire(400);
		expect(writeFile).toHaveBeenCalledTimes(1); // queued behind the in-flight write

		release!();
		await vi.waitFor(() => expect(writeFile).toHaveBeenCalledTimes(2));
		expect(writeFile.mock.calls[1]![1]).toBe(serializeDocument(docWith('second'), blocks, schema));
	});

	it('cancels a pending autosave on stop', async () => {
		const clock = fakeClock();
		const writeFile = vi.fn().mockResolvedValue({ sha: 'sha-2', commitSha: 'commit' });
		const { controller } = harness({
			adapter: { writeFile },
			autosaveMs: 400,
			schedule: clock.schedule
		});
		await controller.load();
		controller.documentChanged(docWith('typed'));

		controller.stop();

		expect(clock.fire(400)).toBe(0);
		expect(writeFile).not.toHaveBeenCalled();
	});
});

describe('createEditorController — Page templates', () => {
	it("loads and saves meta that only the document's own template declares", async () => {
		const templated = createContentModel({
			blocks: [],
			templates: {
				'./A.svelte': { template: { id: 'a', label: 'A' } },
				'./B.svelte': { template: { id: 'b', label: 'B', meta: { banner: { default: '' } } } }
			},
			meta: { title: { default: 'Untitled' } }
		});
		const meta = { title: 'T', template: 'b', banner: '/hero.png' };
		const content = JSON.stringify({ type: 'doc', content: [], meta });
		const writeFile = vi.fn().mockResolvedValue({ sha: 'sha-2', commitSha: 'commit' });
		const { controller } = harness({
			schemaFor: templated.schemaFor,
			adapter: { readFile: vi.fn().mockResolvedValue({ content, sha: 'sha-1' }), writeFile }
		});

		await controller.load();
		await controller.save();

		expect(JSON.parse(writeFile.mock.calls[0]![1]).meta).toEqual(meta);
	});
});
