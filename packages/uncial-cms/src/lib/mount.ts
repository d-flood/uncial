import 'uncial/web-components';
import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
import type { UncialEditorElement } from 'uncial/web-components';
import { parseDocument, serializeDocument } from './document.js';
import { ConflictError } from './errors.js';
import { createGitHubAdapter, patSessionProvider } from './github/index.js';
import { UNCIAL_CMS_RUNTIME_SENTINEL } from './sentinel.js';
import type { ForgeAdapter, ForgeSession, SessionProvider, UncialCmsSiteConfig } from './types.js';

export interface MountEditorPageOptions {
	config: UncialCmsSiteConfig;
	sourcePath: string; // repo-root-relative JSON path
	blocks: unknown; // site registry, passed through to the element
	schema: unknown; // site schema, passed through to the element
	sessionProvider?: SessionProvider;
}

function createAdapter(config: UncialCmsSiteConfig): ForgeAdapter {
	if (config.forge === 'github') return createGitHubAdapter();
	throw new Error(`Unknown forge "${config.forge}".`);
}

export function mountEditorPage(
	target: HTMLElement,
	opts: MountEditorPageOptions
): { destroy(): void } {
	const { config, sourcePath, sessionProvider = patSessionProvider } = opts;
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

	chrome.append(saveButton, status);
	root.append(chrome, banner, editor);
	target.append(root);

	let destroyed = false;
	let adapter: ForgeAdapter | null = null;
	let session: ForgeSession | null = null;
	let sha: string | null = null;
	let currentDocument: ContentDocument | null = null;

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
				message: `Update ${sourcePath} via uncial-cms`,
				sha: sha ?? undefined,
				author: { name: session.user.name, email: session.user.email }
			});
			sha = result.sha;
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
		}
	};
}
