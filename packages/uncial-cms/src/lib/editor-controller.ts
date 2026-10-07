/**
 * Headless editor-page orchestration (ticket 05). Owns the load → edit → save
 * lifecycle, deploy-status polling, and conflict recovery, talking to the DOM
 * only through the {@link EditorPageUi} callback surface. `mount.ts` is the DOM
 * binding; both the per-page editor variants and the index fallback editor go
 * through it, so all three surfaces share this one behaviour.
 */
import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
import { parseDocument, serializeDocument } from './document.js';
import { ConflictError } from './errors.js';
import {
	DEFAULT_DEPLOY_STATUS_TIMINGS,
	defaultSchedule,
	describeDeployPhase,
	githubCommitUrl,
	startDeployPolling,
	type DeployPollHandle,
	type DeployStatusTimings,
	type Schedule
} from './deploy-status.js';
import type { ServerForgeAdapter } from './server-forge/adapter.js';
import type { Action, ContentView, VersionView } from './server-forge/protocol.js';
import type { ForgeAdapter, ForgeSession, SessionProvider, UncialCmsSiteConfig } from './types.js';
import { setActiveForge } from './upload-context.js';

export interface StatusView {
	text: string;
	/** Optional commit permalink, rendered as a follow-up link. */
	href?: string;
	tone: 'progress' | 'success' | 'error';
}

/** A `server` forge record's Draft/Published state and the user's permitted actions. */
export interface RecordState {
	draft: boolean;
	published: boolean;
	allowed: Action[];
}

export interface DownloadPayload {
	filename: string;
	content: string;
	mimeType: string;
}

/** The DOM-facing surface the controller drives. */
export interface EditorPageUi {
	/** Render the status line (optionally with a commit link). */
	status(view: StatusView): void;
	/** Replace the editor's document (initial load and reload-latest). */
	setDocument(doc: ContentDocument): void;
	/** Enable or disable the save control. */
	saveEnabled(enabled: boolean): void;
	/** Show or hide the conflict recovery banner. */
	conflictVisible(visible: boolean): void;
	/** The record's state, reported by the `server` forge only. */
	record?(state: RecordState): void;
	/** The record moved to a new path; this controller no longer addresses it. */
	moved?(path: string): void;
	failed?(error: unknown): void;
}

export interface EditorControllerOptions {
	config: UncialCmsSiteConfig;
	sourcePath: string;
	/** Site-relative path for the deterministic commit message; defaults to sourcePath. */
	pagePath?: string;
	blocks: BlockRegistry;
	schema: ContentSchema;
	adapter: ForgeAdapter;
	sessionProvider: SessionProvider;
	ui: EditorPageUi;
	/** Blocking confirm; the DOM binding passes `window.confirm`. */
	confirm: (message: string) => boolean;
	/** Trigger a file download of the given payload. */
	download: (payload: DownloadPayload) => void;
	timings?: DeployStatusTimings;
	/**
	 * Debounced autosave: every change schedules a save this many milliseconds
	 * later, and a further change restarts the wait. Omitted leaves saving
	 * manual. A backend with no second writer — the local filesystem — is what
	 * this is for; on a forge every keystroke would become a commit.
	 */
	autosaveMs?: number;
	schedule?: Schedule;
	/** True once the owning surface has been torn down. */
	isDestroyed?: () => boolean;
}

export interface EditorController {
	load(): Promise<void>;
	save(): Promise<void>;
	/** Conflict banner action (b): discard the unsaved doc and refetch (after confirm). */
	reloadLatest(): Promise<void>;
	/** Conflict banner action (a): download the unsaved doc as JSON. */
	downloadMyVersion(): void;
	/** Close the banner, leaving content and the save button untouched. */
	dismissConflict(): void;
	/** `server` forge only: save any unsaved edit, then publish the Draft. */
	publish(): Promise<void>;
	/** `server` forge only: withdraw the Published copy. */
	unpublish(): Promise<void>;
	/** `server` forge only: delete the record (after confirm); true once deleted. */
	remove(): Promise<boolean>;
	/** `server` forge only: the record's Versions, newest first. */
	history(): Promise<VersionView[]>;
	/** `server` forge only: one Version's document, for read-only display. */
	version(versionId: string): Promise<ContentDocument>;
	/** `server` forge only: replace the Draft with a Version (after confirm); true once restored. */
	restore(versionId: string): Promise<boolean>;
	/** `server` forge only: save any unsaved edit, then move the record to `to`. */
	move(to: string): Promise<void>;
	/** Forwarded editor change events. */
	documentChanged(doc: ContentDocument): void;
	isDirty(): boolean;
	/** Cancel any pending autosave and any in-flight deploy polling. */
	stop(): void;
}

/** Basename of the JSON source, used for the conflict download filename. */
export function conflictDownloadFilename(sourcePath: string): string {
	const base = sourcePath.split('/').pop() || 'document';
	return base.endsWith('.json') ? base : `${base}.json`;
}

export function createEditorController(opts: EditorControllerOptions): EditorController {
	const { config, sourcePath, blocks, schema, adapter, sessionProvider, ui } = opts;
	const timings = opts.timings ?? DEFAULT_DEPLOY_STATUS_TIMINGS;
	const schedule = opts.schedule ?? defaultSchedule;
	const destroyed = () => opts.isDestroyed?.() ?? false;
	const server = config.forge === 'server' ? (adapter as ServerForgeAdapter) : null;
	const branch =
		config.forge === 'github'
			? config.branch
			: config.forge === 'server'
				? 'the server'
				: 'the local checkout';

	let session: ForgeSession | null = null;
	let sha: string | null = null;
	let currentDocument: ContentDocument | null = null;
	let dirty = false;
	let poll: DeployPollHandle | null = null;
	let cancelAutosave: (() => void) | null = null;
	let saving = false;
	let saveAgain = false;
	let record: RecordState | null = null;

	const showRecord = (next: RecordState) => {
		record = next;
		ui.record?.(record);
	};

	const read = async (): Promise<{ content: string; sha: string; view?: ContentView }> => {
		if (!server) return adapter.readFile(sourcePath);
		const view = await server.getRecord(sourcePath);
		return { content: JSON.stringify(view.draft ?? view.published), sha: view.etag, view };
	};

	const applyView = (view: ContentView | undefined) => {
		if (!view) return;
		showRecord({ draft: view.draft !== null, published: view.published !== null, allowed: view.allowed });
	};

	const showFailure = (error: unknown, fallback: string) => {
		ui.failed?.(error);
		if (error instanceof ConflictError) {
			// Do NOT touch content or dirty state: the unsaved edit must survive.
			ui.conflictVisible(true);
			ui.status({
				tone: 'error',
				text: `Save conflicted — this page changed on ${branch} since you loaded it.`
			});
		} else {
			ui.status({ tone: 'error', text: error instanceof Error ? error.message : fallback });
		}
	};

	const editingStatus = () =>
		ui.status({ tone: 'progress', text: `Editing ${sourcePath} as ${session?.user.login ?? '…'}` });

	const stopPolling = () => {
		poll?.cancel();
		poll = null;
	};

	const cancelPendingAutosave = () => {
		cancelAutosave?.();
		cancelAutosave = null;
	};

	const startPolling = (commitSha: string) => {
		const commitUrl = config.forge === 'github' ? githubCommitUrl(config.repo, commitSha) : '';
		poll = startDeployPolling({
			check: () => adapter.commitStatus(commitSha),
			onPhase: (phase) => {
				if (destroyed()) return;
				const view = describeDeployPhase(phase, { branch, commitSha, commitUrl });
				ui.status({ text: view.text, href: view.commitUrl, tone: view.tone });
			},
			timings,
			schedule: opts.schedule
		});
	};

	const load = async () => {
		ui.status({ tone: 'progress', text: 'Signing in…' });
		session = await adapter.authenticate(config, sessionProvider);
		if (destroyed()) return;
		// Publish the authenticated forge so in-editor block UIs (the Image block's
		// upload) can reach the same adapter + author. Cleared by mountEditorPage on
		// teardown.
		setActiveForge({
			adapter,
			author: { name: session.user.name, email: session.user.email },
			config
		});
		ui.status({ tone: 'progress', text: 'Loading…' });
		const file = await read();
		if (destroyed()) return;
		sha = file.sha;
		applyView(file.view);
		currentDocument = parseDocument(file.content, blocks, schema);
		ui.setDocument(currentDocument);
		dirty = false;
		ui.saveEnabled(true);
		editingStatus();
	};

	const save = async () => {
		if (!session || !currentDocument) return;
		// Autosave makes overlapping writes reachable in a way manual saving did
		// not: a keystroke landing mid-write would otherwise PUT against a sha the
		// in-flight save is about to replace. Coalesce into one follow-up save.
		if (saving) {
			saveAgain = true;
			return;
		}
		saving = true;
		cancelPendingAutosave();
		stopPolling();
		ui.conflictVisible(false);
		ui.saveEnabled(false);
		ui.status({ tone: 'progress', text: 'Saving…' });
		try {
			const content = serializeDocument(currentDocument, blocks, schema);
			const result = await adapter.writeFile(sourcePath, content, {
				message: `uncial-cms: edit ${opts.pagePath ?? sourcePath}`,
				sha: sha ?? undefined,
				author: { name: session.user.name, email: session.user.email }
			});
			sha = result.sha;
			dirty = false;
			if (server && result.path && result.path !== sourcePath) {
				saveAgain = false;
				ui.status({ tone: 'success', text: `Draft saved · moved to ${result.path}` });
				ui.moved?.(result.path);
			} else if (server) {
				if (record) showRecord({ ...record, draft: true });
				ui.status({ tone: 'success', text: 'Draft saved' });
			} else {
				startPolling(result.commitSha);
			}
		} catch (error) {
			showFailure(error, 'Save failed.');
		} finally {
			saving = false;
			if (!destroyed()) ui.saveEnabled(true);
			if (saveAgain && !destroyed()) {
				saveAgain = false;
				void save();
			}
		}
	};

	const reloadLatest = async () => {
		const proceed = opts.confirm(
			`Reload the latest version from ${branch}? This discards your unsaved changes` +
				' unless you have downloaded them.'
		);
		if (!proceed) return; // Only "Reload latest" (confirmed) replaces content + sha.
		const file = await read();
		if (destroyed()) return;
		sha = file.sha;
		applyView(file.view);
		currentDocument = parseDocument(file.content, blocks, schema);
		ui.setDocument(currentDocument);
		dirty = false;
		ui.conflictVisible(false);
		editingStatus();
	};

	const downloadMyVersion = () => {
		if (!currentDocument) return;
		opts.download({
			filename: conflictDownloadFilename(sourcePath),
			content: serializeDocument(currentDocument, blocks, schema),
			mimeType: 'application/json'
		});
	};

	const dismissConflict = () => {
		ui.conflictVisible(false);
	};

	const transition = async (action: 'publish' | 'unpublish') => {
		if (!server || !session || sha === null) return;
		cancelPendingAutosave();
		if (dirty) {
			await save();
			if (dirty) return;
		}
		if (action === 'publish' && !record?.draft) {
			ui.status({ tone: 'success', text: 'Nothing to publish · the Published copy is current' });
			return;
		}
		ui.conflictVisible(false);
		ui.saveEnabled(false);
		ui.status({ tone: 'progress', text: action === 'publish' ? 'Publishing…' : 'Unpublishing…' });
		try {
			const view = await server[action](sourcePath, sha);
			sha = view.etag;
			applyView(view);
			ui.status({
				tone: 'success',
				text: action === 'publish' ? 'Published · live now' : 'Unpublished · no longer public'
			});
		} catch (error) {
			showFailure(error, `${action === 'publish' ? 'Publish' : 'Unpublish'} failed.`);
		} finally {
			if (!destroyed()) ui.saveEnabled(true);
		}
	};

	const remove = async () => {
		if (!server || !session || sha === null) return false;
		if (!opts.confirm(`Delete ${opts.pagePath ?? sourcePath}? This cannot be undone.`)) return false;
		cancelPendingAutosave();
		ui.saveEnabled(false);
		ui.status({ tone: 'progress', text: 'Deleting…' });
		try {
			await adapter.deleteFile(sourcePath, { message: '', sha });
			dirty = false;
			ui.status({ tone: 'success', text: 'Deleted' });
			return true;
		} catch (error) {
			showFailure(error, 'Delete failed.');
			if (!destroyed()) ui.saveEnabled(true);
			return false;
		}
	};

	const history = async () => (server ? server.versions(sourcePath) : []);

	const version = async (versionId: string) => {
		if (!server) throw new Error('Versions exist on the server forge only.');
		const doc = await server.getVersion(sourcePath, versionId);
		return parseDocument(JSON.stringify(doc), blocks, schema);
	};

	const restore = async (versionId: string) => {
		if (!server || !session || sha === null) return false;
		if (!opts.confirm('Restore this Version? It replaces the current Draft.')) return false;
		cancelPendingAutosave();
		ui.conflictVisible(false);
		ui.saveEnabled(false);
		ui.status({ tone: 'progress', text: 'Restoring…' });
		try {
			const view = await server.restore(sourcePath, versionId, sha);
			sha = view.etag;
			applyView(view);
			currentDocument = parseDocument(JSON.stringify(view.draft), blocks, schema);
			ui.setDocument(currentDocument);
			dirty = false;
			ui.status({ tone: 'success', text: 'Version restored into the Draft' });
			return true;
		} catch (error) {
			showFailure(error, 'Restore failed.');
			return false;
		} finally {
			if (!destroyed()) ui.saveEnabled(true);
		}
	};

	const move = async (to: string) => {
		if (!server || !session || sha === null) return;
		cancelPendingAutosave();
		if (dirty) {
			await save();
			if (dirty) return;
		}
		ui.conflictVisible(false);
		ui.saveEnabled(false);
		ui.status({ tone: 'progress', text: 'Moving…' });
		try {
			const view = await server.move(sourcePath, to, sha);
			sha = view.etag;
			ui.status({ tone: 'success', text: `Moved to ${view.path}` });
			ui.moved?.(view.path);
		} catch (error) {
			showFailure(error, 'Move failed.');
		} finally {
			if (!destroyed()) ui.saveEnabled(true);
		}
	};

	const documentChanged = (doc: ContentDocument) => {
		currentDocument = doc;
		dirty = true;
		if (opts.autosaveMs === undefined) return;
		cancelPendingAutosave();
		cancelAutosave = schedule(() => {
			cancelAutosave = null;
			void save();
		}, opts.autosaveMs);
	};

	return {
		load,
		save,
		reloadLatest,
		downloadMyVersion,
		dismissConflict,
		publish: () => transition('publish'),
		unpublish: () => transition('unpublish'),
		remove,
		history,
		version,
		restore,
		move,
		documentChanged,
		isDirty: () => dirty,
		stop: () => {
			cancelPendingAutosave();
			stopPolling();
		}
	};
}
