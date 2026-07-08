/**
 * `/uncial/` site-index runtime (PRD §6.6, D2): list/create/delete pages and
 * the hash-routed fallback editor (`#/<path>/`). Framework-agnostic plain DOM,
 * same style as mountEditorPage — the SvelteKit index route is just a shell
 * that calls this.
 */
import { createPage, deletePage, listPages } from './index-actions.js';
import type { PageRef } from './index-actions.js';
import { mountEditorPage } from './mount.js';
import { hashForPagePath, pagePathFromHash, validatePagePath } from './paths.js';
import { createGitHubAdapter, popupSessionProvider } from './github/index.js';
import { defaultMapPathToSource } from './sveltekit/mapping.js';
import { UNCIAL_CMS_RUNTIME_SENTINEL } from './sentinel.js';
import type { ForgeAdapter, ForgeSession, SessionProvider, UncialCmsSiteConfig } from './types.js';

export interface MountIndexPageOptions {
	config: UncialCmsSiteConfig;
	blocks: unknown;
	schema: unknown;
	sessionProvider?: SessionProvider;
	/** Site-relative page path → repo-root-relative JSON path. Defaults to the
	 * mapping convention; must match the one baked into the editor variants. */
	mapPathToSource?: (path: string) => string;
	/** Inverse of mapPathToSource, used to label listed sources. */
	mapSourceToPath?: (source: string) => string;
	/** URL prefix for live-page links (the framework's base path), e.g.
	 * '/uncial/cms-demo'. Default ''. */
	basePath?: string;
	editorStylesheets?: string[];
}

function createAdapter(config: UncialCmsSiteConfig): ForgeAdapter {
	if (config.forge === 'github') return createGitHubAdapter();
	throw new Error(`Unknown forge "${config.forge}".`);
}

export function mountIndexPage(
	target: HTMLElement,
	opts: MountIndexPageOptions
): { destroy(): void } {
	const { config, sessionProvider = popupSessionProvider, basePath = '' } = opts;
	const mapPathToSource =
		opts.mapPathToSource ?? ((path: string) => defaultMapPathToSource(path, config.contentDir));

	const root = document.createElement('div');
	root.className = 'uncial-cms-index';
	root.dataset.uncialCmsRuntime = UNCIAL_CMS_RUNTIME_SENTINEL;

	const status = document.createElement('p');
	status.className = 'uncial-cms-status';
	status.setAttribute('role', 'status');

	const listView = document.createElement('section');
	listView.className = 'uncial-cms-index-list';

	const editorView = document.createElement('section');
	editorView.className = 'uncial-cms-fallback-editor';
	editorView.hidden = true;

	root.append(status, listView, editorView);
	target.append(root);

	let destroyed = false;
	let adapter: ForgeAdapter | null = null;
	let session: ForgeSession | null = null;
	let editorHandle: { destroy(): void; isDirty(): boolean } | null = null;
	let currentHash: string = location.hash;
	let revertingHash = false;

	const setStatus = (text: string) => {
		status.textContent = text;
	};

	const livePageUrl = (pagePath: string) => `${basePath}/${pagePath === '' ? '' : `${pagePath}/`}`;

	const renderList = (pages: PageRef[]) => {
		listView.replaceChildren();

		const heading = document.createElement('h2');
		heading.textContent = 'Pages';

		const list = document.createElement('ul');
		for (const page of pages) {
			const item = document.createElement('li');

			const live = document.createElement('a');
			live.href = livePageUrl(page.pagePath);
			live.textContent = page.pagePath === '' ? '(site root)' : `/${page.pagePath}/`;

			// Always link the fallback editor — it works whether or not the page's
			// static variant has deployed yet.
			const edit = document.createElement('a');
			edit.href = hashForPagePath(page.pagePath);
			edit.textContent = 'Edit';

			const del = document.createElement('button');
			del.type = 'button';
			del.textContent = 'Delete';
			del.addEventListener('click', () => void onDelete(page));

			item.append(live, ' ', edit, ' ', del);
			list.append(item);
		}

		const form = document.createElement('form');
		form.className = 'uncial-cms-create';

		const label = document.createElement('label');
		label.textContent = 'New page path ';
		const input = document.createElement('input');
		input.name = 'path';
		input.placeholder = 'team/new-page';
		label.append(input);

		const submit = document.createElement('button');
		submit.type = 'submit';
		submit.textContent = 'Create page';

		const message = document.createElement('p');
		message.className = 'uncial-cms-create-message';
		message.setAttribute('role', 'alert');
		message.hidden = true;

		form.append(label, ' ', submit, message);
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			void onCreate(input.value, message, submit);
		});

		listView.append(heading, list, form);
	};

	const refreshList = async () => {
		if (!adapter) return;
		setStatus('Loading pages…');
		const pages = await listPages(adapter, config.contentDir, opts.mapSourceToPath);
		if (destroyed) return;
		renderList(pages);
		setStatus(`Editing ${config.repo}@${config.branch} as ${session!.user.login}`);
	};

	const onCreate = async (raw: string, message: HTMLElement, submit: HTMLButtonElement) => {
		const result = validatePagePath(raw);
		if (!result.ok) {
			message.hidden = false;
			message.textContent = result.message;
			return;
		}
		if (!adapter || !session) return;

		message.hidden = true;
		submit.disabled = true;
		try {
			await createPage(
				{ adapter, blocks: opts.blocks, schema: opts.schema, author: session.user },
				{ pagePath: result.path, sourcePath: mapPathToSource(result.path) }
			);
			// Open the fallback editor immediately — the static variant only
			// appears after the next deploy.
			location.hash = hashForPagePath(result.path);
		} catch (error) {
			message.hidden = false;
			message.textContent = error instanceof Error ? error.message : 'Create failed.';
		} finally {
			submit.disabled = false;
		}
	};

	const onDelete = async (page: PageRef) => {
		if (!adapter) return;
		const confirmed = window.confirm(
			`Delete ${page.sourcePath} from ${config.branch}? This commits the deletion immediately.`
		);
		if (!confirmed) return;
		try {
			await deletePage(adapter, page);
			await refreshList();
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Delete failed.');
		}
	};

	const closeEditor = () => {
		editorHandle?.destroy();
		editorHandle = null;
		editorView.replaceChildren();
		editorView.hidden = true;
		listView.hidden = false;
	};

	const openEditor = (pagePath: string) => {
		closeEditor();
		listView.hidden = true;
		editorView.hidden = false;

		const back = document.createElement('a');
		back.href = '#';
		back.textContent = '← Back to index';

		const heading = document.createElement('h2');
		heading.textContent = pagePath === '' ? 'Editing site root' : `Editing /${pagePath}/`;

		const mountTarget = document.createElement('div');
		editorView.append(back, heading, mountTarget);

		editorHandle = mountEditorPage(mountTarget, {
			config,
			sourcePath: mapPathToSource(pagePath),
			pagePath,
			blocks: opts.blocks,
			schema: opts.schema,
			sessionProvider,
			editorStylesheets: opts.editorStylesheets
		});
	};

	const applyHash = () => {
		const pagePath = pagePathFromHash(location.hash);
		if (pagePath === null) {
			closeEditor();
			void refreshList().catch((error: unknown) => {
				setStatus(error instanceof Error ? error.message : 'Failed to list pages.');
			});
		} else {
			openEditor(pagePath);
		}
		currentHash = location.hash;
	};

	const onHashChange = () => {
		if (revertingHash) {
			revertingHash = false;
			return;
		}
		if (editorHandle?.isDirty() && !window.confirm('Discard unsaved changes?')) {
			revertingHash = true;
			location.hash = currentHash;
			return;
		}
		applyHash();
	};

	const onBeforeUnload = (event: BeforeUnloadEvent) => {
		if (editorHandle?.isDirty()) event.preventDefault();
	};

	window.addEventListener('hashchange', onHashChange);
	window.addEventListener('beforeunload', onBeforeUnload);

	const load = async () => {
		setStatus('Signing in…');
		adapter = createAdapter(config);
		session = await adapter.authenticate(config, sessionProvider);
		if (destroyed) return;
		applyHash();
	};

	void load().catch((error: unknown) => {
		if (destroyed) return;
		setStatus(error instanceof Error ? error.message : 'Failed to load the site index.');
	});

	return {
		destroy() {
			destroyed = true;
			window.removeEventListener('hashchange', onHashChange);
			window.removeEventListener('beforeunload', onBeforeUnload);
			editorHandle?.destroy();
			root.remove();
		}
	};
}
