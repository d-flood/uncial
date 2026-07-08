import 'uncial/web-components';
import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
import type { UncialEditorElement } from 'uncial/web-components';
import { parseDocument, serializeDocument } from './document.js';
import { ConflictError } from './errors.js';
import { createGitHubAdapter, popupSessionProvider } from './github/index.js';
import { UNCIAL_CMS_RUNTIME_SENTINEL } from './sentinel.js';
import type { ForgeAdapter, ForgeSession, SessionProvider, UncialCmsSiteConfig } from './types.js';

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

	// Conflict seam: issue 05 replaces this banner with real recovery UX.
	const banner = document.createElement('div');
	banner.className = 'uncial-cms-banner';
	banner.setAttribute('role', 'alert');
	banner.hidden = true;

	const editor = document.createElement('uncial-editor') as UncialEditorElement;
	mirrorPageStylesIntoEditor(editor, opts.editorStylesheets);

	chrome.append(saveButton, status);
	root.append(chrome, banner, editor);
	target.append(root);

	let destroyed = false;
	let adapter: ForgeAdapter | null = null;
	let session: ForgeSession | null = null;
	let sha: string | null = null;
	let currentDocument: ContentDocument | null = null;
	let dirty = false;

	const setStatus = (text: string) => {
		status.textContent = text;
	};

	const showConflict = () => {
		banner.hidden = false;
		banner.textContent =
			`This page changed on ${config.branch} since it was loaded. ` +
			'Reload the page and re-apply your edit.';
	};

	const onChange = (event: Event) => {
		currentDocument = (event as CustomEvent<ContentDocument>).detail;
		dirty = true;
	};
	editor.addEventListener('uncial-change', onChange);

	const load = async () => {
		setStatus('Signing in…');
		adapter = createAdapter(config);
		session = await adapter.authenticate(config, sessionProvider);
		if (destroyed) return;

		setStatus('Loading…');
		const file = await adapter.readFile(sourcePath);
		if (destroyed) return;

		sha = file.sha;
		currentDocument = parseDocument(file.content, blocks, schema);
		editor.blocks = blocks;
		editor.schema = schema;
		editor.json = currentDocument;
		saveButton.disabled = false;
		setStatus(`Editing ${sourcePath} as ${session.user.login}`);
	};

	const save = async () => {
		if (!adapter || !session || !currentDocument) return;
		banner.hidden = true;
		saveButton.disabled = true;
		setStatus('Saving…');
		try {
			const content = serializeDocument(currentDocument, blocks, schema);
			const result = await adapter.writeFile(sourcePath, content, {
				message: `uncial-cms: edit ${opts.pagePath ?? sourcePath}`,
				sha: sha ?? undefined,
				author: { name: session.user.name, email: session.user.email }
			});
			sha = result.sha;
			dirty = false;
			setStatus(`Saved as commit ${result.commitSha.slice(0, 7)}`);
		} catch (error) {
			if (error instanceof ConflictError) {
				showConflict();
				setStatus('Save conflicted');
			} else {
				setStatus(error instanceof Error ? error.message : 'Save failed');
			}
		} finally {
			if (!destroyed) saveButton.disabled = false;
		}
	};
	saveButton.addEventListener('click', () => void save());

	void load().catch((error: unknown) => {
		if (destroyed) return;
		setStatus(error instanceof Error ? error.message : 'Failed to load the document.');
	});

	return {
		destroy() {
			destroyed = true;
			editor.removeEventListener('uncial-change', onChange);
			root.remove();
		},
		isDirty() {
			return dirty;
		}
	};
}
