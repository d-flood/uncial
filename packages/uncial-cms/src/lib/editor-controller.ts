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
	describeDeployPhase,
	githubCommitUrl,
	startDeployPolling,
	type DeployPollHandle,
	type DeployStatusTimings,
	type Schedule
} from './deploy-status.js';
import type { ForgeAdapter, ForgeSession, SessionProvider, UncialCmsSiteConfig } from './types.js';

export interface StatusView {
	text: string;
	/** Optional commit permalink, rendered as a follow-up link. */
	href?: string;
	tone: 'progress' | 'success' | 'error';
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
	/** Forwarded editor change events. */
	documentChanged(doc: ContentDocument): void;
	isDirty(): boolean;
	/** Cancel any in-flight deploy polling. */
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
	const destroyed = () => opts.isDestroyed?.() ?? false;

	let session: ForgeSession | null = null;
	let sha: string | null = null;
	let currentDocument: ContentDocument | null = null;
	let dirty = false;
	let poll: DeployPollHandle | null = null;

	const editingStatus = () =>
		ui.status({ tone: 'progress', text: `Editing ${sourcePath} as ${session?.user.login ?? '…'}` });

	const stopPolling = () => {
		poll?.cancel();
		poll = null;
	};

	const startPolling = (commitSha: string) => {
		const commitUrl = githubCommitUrl(config.repo, commitSha);
		poll = startDeployPolling({
			check: () => adapter.commitStatus(commitSha),
			onPhase: (phase) => {
				if (destroyed()) return;
				const view = describeDeployPhase(phase, { branch: config.branch, commitSha, commitUrl });
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
		ui.status({ tone: 'progress', text: 'Loading…' });
		const file = await adapter.readFile(sourcePath);
		if (destroyed()) return;
		sha = file.sha;
		currentDocument = parseDocument(file.content, blocks, schema);
		ui.setDocument(currentDocument);
		dirty = false;
		ui.saveEnabled(true);
		editingStatus();
	};

	const save = async () => {
		if (!session || !currentDocument) return;
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
			startPolling(result.commitSha);
		} catch (error) {
			if (error instanceof ConflictError) {
				// Do NOT touch content or dirty state: the unsaved edit must survive.
				ui.conflictVisible(true);
				ui.status({
					tone: 'error',
					text: `Save conflicted — this page changed on ${config.branch} since you loaded it.`
				});
			} else {
				ui.status({ tone: 'error', text: error instanceof Error ? error.message : 'Save failed.' });
			}
		} finally {
			if (!destroyed()) ui.saveEnabled(true);
		}
	};

	const reloadLatest = async () => {
		const proceed = opts.confirm(
			`Reload the latest version from ${config.branch}? This discards your unsaved changes` +
				' unless you have downloaded them.'
		);
		if (!proceed) return; // Only "Reload latest" (confirmed) replaces content + sha.
		const file = await adapter.readFile(sourcePath);
		if (destroyed()) return;
		sha = file.sha;
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

	const documentChanged = (doc: ContentDocument) => {
		currentDocument = doc;
		dirty = true;
	};

	return {
		load,
		save,
		reloadLatest,
		downloadMyVersion,
		dismissConflict,
		documentChanged,
		isDirty: () => dirty,
		stop: stopPolling
	};
}
