import { describe, expect, it, vi } from 'vitest';
import { createBlockRegistry, createSchema, normalizeDocument } from 'uncial/core';
import type { ContentDocument } from 'uncial/core';
import { serializeDocument } from './document.js';
import { ConflictError } from './errors.js';
import {
	conflictDownloadFilename,
	createEditorController,
	type DownloadPayload,
	type EditorControllerOptions,
	type EditorPageUi,
	type StatusView
} from './editor-controller.js';
import type { Schedule } from './deploy-status.js';
import type { ForgeAdapter, ForgeSession, UncialCmsSiteConfig } from './types.js';

const blocks = createBlockRegistry([]);
const schema = createSchema(blocks, { metaFields: { title: { default: 'Untitled', required: true } } });

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

function makeUi() {
	const statuses: StatusView[] = [];
	const documents: ContentDocument[] = [];
	const saveStates: boolean[] = [];
	const conflicts: boolean[] = [];
	const ui: EditorPageUi = {
		status: (v) => statuses.push(v),
		setDocument: (d) => documents.push(d),
		saveEnabled: (e) => saveStates.push(e),
		conflictVisible: (v) => conflicts.push(v)
	};
	return { ui, statuses, documents, saveStates, conflicts };
}

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
	confirm?: (message: string) => boolean;
	download?: (payload: DownloadPayload) => void;
	autosaveMs?: number;
	schedule?: Schedule;
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
	const ui = makeUi();
	const options: EditorControllerOptions = {
		config,
		sourcePath: 'content/about.json',
		blocks,
		schema,
		adapter,
		sessionProvider: vi.fn().mockResolvedValue(session),
		ui: ui.ui,
		confirm: overrides.confirm ?? (() => true),
		download: overrides.download ?? vi.fn(),
		autosaveMs: overrides.autosaveMs,
		// Never-firing scheduler by default: deploy polling stays inert in these
		// unit tests.
		schedule: overrides.schedule ?? (() => () => {})
	};
	const controller = createEditorController(options);
	return { controller, adapter, ...ui };
}

describe('createEditorController — save conflict', () => {
	it('shows the conflict banner and preserves the unsaved document on a ConflictError', async () => {
		const { controller, adapter, conflicts, saveStates } = harness({
			adapter: { writeFile: vi.fn().mockRejectedValue(new ConflictError()) }
		});
		await controller.load();
		controller.documentChanged(docWith('my unsaved edit'));

		await controller.save();

		expect(conflicts).toContain(true); // banner shown
		expect(controller.isDirty()).toBe(true); // content untouched
		expect(saveStates.at(-1)).toBe(true); // save button stays active
		expect(adapter.readFile).toHaveBeenCalledTimes(1); // no silent reload
	});
});

describe('createEditorController — download my version', () => {
	it('downloads the unsaved normalized document as JSON without changing state', async () => {
		const download = vi.fn();
		const { controller, conflicts } = harness({
			adapter: { writeFile: vi.fn().mockRejectedValue(new ConflictError()) },
			download
		});
		await controller.load();
		const edited = docWith('my unsaved edit');
		controller.documentChanged(edited);
		await controller.save();

		controller.downloadMyVersion();

		expect(download).toHaveBeenCalledTimes(1);
		const payload = download.mock.calls[0]![0] as DownloadPayload;
		expect(payload.filename).toBe('about.json');
		expect(payload.mimeType).toBe('application/json');
		expect(payload.content).toBe(serializeDocument(edited, blocks, schema));
		// Download does not close the banner or discard the edit.
		expect(conflicts.at(-1)).toBe(true);
		expect(controller.isDirty()).toBe(true);
	});
});

describe('createEditorController — reload latest', () => {
	it('does nothing when the confirm is declined', async () => {
		const { controller, adapter, documents } = harness({
			adapter: {
				readFile: vi
					.fn()
					.mockResolvedValueOnce({ content: JSON.stringify(docWith('original')), sha: 'sha-1' })
					.mockResolvedValueOnce({ content: JSON.stringify(docWith('latest')), sha: 'sha-9' })
			},
			confirm: () => false
		});
		await controller.load();
		const setDocsAfterLoad = documents.length;

		await controller.reloadLatest();

		expect(adapter.readFile).toHaveBeenCalledTimes(1); // second read never happened
		expect(documents.length).toBe(setDocsAfterLoad); // content not replaced
	});

	it('replaces content and sha only after confirm, then saves against the new sha', async () => {
		const writeFile = vi.fn().mockResolvedValue({ sha: 'sha-after', commitSha: 'c2' });
		const { controller, documents, conflicts } = harness({
			adapter: {
				readFile: vi
					.fn()
					.mockResolvedValueOnce({ content: JSON.stringify(docWith('original')), sha: 'sha-1' })
					.mockResolvedValueOnce({ content: JSON.stringify(docWith('latest')), sha: 'sha-9' }),
				writeFile
			},
			confirm: () => true
		});
		await controller.load();

		await controller.reloadLatest();

		expect(documents.at(-1)).toEqual(docWith('latest')); // content replaced
		expect(conflicts.at(-1)).toBe(false); // banner closed
		expect(controller.isDirty()).toBe(false);

		await controller.save();
		expect(writeFile.mock.calls[0]![2].sha).toBe('sha-9'); // saved against the reloaded sha
	});
});

describe('conflictDownloadFilename', () => {
	it('uses the JSON basename', () => {
		expect(conflictDownloadFilename('content/blog/hello.json')).toBe('hello.json');
		expect(conflictDownloadFilename('weird')).toBe('weird.json');
	});
});

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
