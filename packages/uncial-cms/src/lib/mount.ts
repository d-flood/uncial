import 'uncial/web-components';
import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
import type { UncialEditorElement } from 'uncial/web-components';
import {
	createEditorController,
	type DownloadPayload,
	type EditorPageUi,
	type StatusView
} from './editor-controller.js';
import { createGitHubAdapter, popupSessionProvider } from './github/index.js';
import { UNCIAL_CMS_RUNTIME_SENTINEL } from './sentinel.js';
import type { ForgeAdapter, SessionProvider, UncialCmsSiteConfig } from './types.js';
import { clearActiveForge } from './upload-context.js';

export interface MountEditorPageOptions {
	config: UncialCmsSiteConfig;
	sourcePath: string; // repo-root-relative JSON path
	/** Site-relative page path, used in the deterministic commit message
	 * `uncial-cms: edit <path>`. Falls back to sourcePath. */
	pagePath?: string;
	blocks: unknown; // site registry, passed through to the element
	schema: unknown; // site schema, passed through to the element
	sessionProvider?: SessionProvider;
	/**
	 * Stylesheet URLs to load inside the editor's shadow root. Defaults to
	 * mirroring every stylesheet of the host page (WYSIWYG parity: the editor
	 * renders behind a shadow boundary, which page styles do not cross).
	 */
	editorStylesheets?: string[];
}

function mirrorPageStylesIntoEditor(editor: UncialEditorElement, explicit?: string[]): void {
	if (explicit) {
		editor.stylesheet = explicit.join(' ');
		return;
	}
	const links = Array.from(
		document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
		(link) => link.href
	);
	if (links.length > 0) editor.stylesheet = links.join(' ');
	// Dev servers inject <style> tags instead of links; clone those too.
	for (const style of document.querySelectorAll('style')) {
		editor.shadowRoot?.append(style.cloneNode(true));
	}
}

function createAdapter(config: UncialCmsSiteConfig): ForgeAdapter {
	if (config.forge === 'github') return createGitHubAdapter();
	throw new Error(`Unknown forge "${config.forge}".`);
}

function triggerDownload(payload: DownloadPayload): void {
	const blob = new Blob([payload.content], { type: payload.mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = payload.filename;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

export function mountEditorPage(
	target: HTMLElement,
	opts: MountEditorPageOptions
): { destroy(): void; isDirty(): boolean } {
	const { config, sourcePath, sessionProvider = popupSessionProvider } = opts;
	const blocks = opts.blocks as BlockRegistry;
	const schema = opts.schema as ContentSchema;

	const root = document.createElement('div');
	root.className = 'uncial-cms-editor-page';
	root.dataset.uncialCmsRuntime = UNCIAL_CMS_RUNTIME_SENTINEL;

	const chrome = document.createElement('div');
	chrome.className = 'uncial-cms-chrome';

	const saveButton = document.createElement('button');
	saveButton.type = 'button';
	saveButton.textContent = 'Save';
	saveButton.disabled = true;

	const status = document.createElement('span');
	status.className = 'uncial-cms-status';
	status.setAttribute('role', 'status');

	// Conflict recovery banner (ticket 05): blocking, offers download + reload,
	// and must never lose the unsaved document.
	const banner = document.createElement('div');
	banner.className = 'uncial-cms-banner';
	banner.setAttribute('role', 'alert');
	banner.hidden = true;

	const bannerText = document.createElement('p');
	bannerText.className = 'uncial-cms-banner-message';
	bannerText.textContent =
		`This page changed on ${config.branch} since you loaded it. ` +
		'Your unsaved changes are safe — choose how to proceed.';

	const downloadButton = document.createElement('button');
	downloadButton.type = 'button';
	downloadButton.textContent = 'Download my version';

	const reloadButton = document.createElement('button');
	reloadButton.type = 'button';
	reloadButton.textContent = 'Reload latest';

	const dismissButton = document.createElement('button');
	dismissButton.type = 'button';
	dismissButton.textContent = 'Dismiss';

	const bannerActions = document.createElement('div');
	bannerActions.className = 'uncial-cms-banner-actions';
	bannerActions.append(downloadButton, reloadButton, dismissButton);
	banner.append(bannerText, bannerActions);

	const editor = document.createElement('uncial-editor') as UncialEditorElement;
	mirrorPageStylesIntoEditor(editor, opts.editorStylesheets);
	editor.blocks = blocks;
	editor.schema = schema;
	// Forward the schema's declared meta fields so the editor renders (and edits)
	// them in its "Edit document metadata" panel. Without this a consumer whose
	// schema declares metaFields gets no metadata UI.
	editor.metaFields = schema.metaFields;

	chrome.append(saveButton, status);
	root.append(chrome, banner, editor);
	target.append(root);

	let destroyed = false;

	const ui: EditorPageUi = {
		status(view: StatusView) {
			status.replaceChildren(document.createTextNode(view.text));
			status.dataset.tone = view.tone;
			if (view.href) {
				status.append(document.createTextNode(' '));
				const link = document.createElement('a');
				link.href = view.href;
				link.target = '_blank';
				link.rel = 'noopener';
				link.textContent = 'View commit';
				status.append(link);
			}
		},
		setDocument(doc: ContentDocument) {
			editor.json = doc;
			// Seed the metadata panel from the loaded document's meta. Without this
			// the panel shows schema defaults, so committing metadata would clobber
			// the document's existing meta (e.g. reset title to its default).
			editor.meta = doc.meta ?? {};
		},
		saveEnabled(enabled: boolean) {
			saveButton.disabled = !enabled;
		},
		conflictVisible(visible: boolean) {
			banner.hidden = !visible;
		}
	};

	const controller = createEditorController({
		config,
		sourcePath,
		pagePath: opts.pagePath,
		blocks,
		schema,
		adapter: createAdapter(config),
		sessionProvider,
		ui,
		confirm: (message) => window.confirm(message),
		download: triggerDownload,
		isDestroyed: () => destroyed
	});

	const onChange = (event: Event) => {
		controller.documentChanged((event as CustomEvent<ContentDocument>).detail);
	};
	editor.addEventListener('uncial-change', onChange);

	saveButton.addEventListener('click', () => void controller.save());
	downloadButton.addEventListener('click', () => controller.downloadMyVersion());
	reloadButton.addEventListener('click', () => void controller.reloadLatest());
	dismissButton.addEventListener('click', () => controller.dismissConflict());

	void controller.load().catch((error: unknown) => {
		if (destroyed) return;
		ui.status({
			tone: 'error',
			text: error instanceof Error ? error.message : 'Failed to load the document.'
		});
	});

	return {
		destroy() {
			destroyed = true;
			controller.stop();
			clearActiveForge();
			editor.removeEventListener('uncial-change', onChange);
			root.remove();
		},
		isDirty() {
			return controller.isDirty();
		}
	};
}
