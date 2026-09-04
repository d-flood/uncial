/**
 * The CMS's editing session without a DOM: storage, autosave, deploy status and
 * conflict recovery, driven by a host that renders the editor however it likes.
 *
 * `mountEditorPage` is the other door onto the same machinery, and it builds the
 * whole surface itself — a custom element with a shadow root, seeded with the
 * host page's stylesheets. That is the right shape for a host with no component
 * model to speak of. It is the wrong shape for one that has Uncial's own
 * `Editor` component available: the shadow boundary that buys style isolation
 * costs a framework host every rule the page sets on `body`, which is where most
 * sites put their type and their ground.
 *
 * So this is the same batteries, minus the surface. A Svelte, React or Vue host
 * renders `Editor` itself, in its own tree and its own cascade, and hands the
 * session four callbacks and each edit as it happens.
 *
 * Reach it at `uncial-cms/session` rather than through the package root. The
 * root exports `mountEditorPage` too, and importing that pulls in the custom
 * element, its shadow-root machinery and the editor's chrome stylesheet — which
 * a host rendering its own surface neither wants loaded nor wants arriving after
 * its own corrections to that stylesheet.
 */
import {
	createEditorController,
	type EditorController,
	type EditorPageUi
} from './editor-controller.js';
import { createGitHubAdapter, popupSessionProvider } from './github/index.js';
import { createLocalAdapter } from './local/adapter.js';
import { localSessionProvider } from './local/session.js';
import type { BlockRegistry, ContentSchema } from 'uncial/core';
import type { ForgeAdapter, SessionProvider, UncialCmsSiteConfig } from './types.js';

export type {
	DownloadPayload,
	EditorController,
	EditorPageUi,
	StatusView
} from './editor-controller.js';

export interface CreateEditorSessionOptions {
	config: UncialCmsSiteConfig;
	/** Repo-root-relative path of the JSON document being edited. */
	sourcePath: string;
	/**
	 * Site-relative page path, used in the deterministic commit message
	 * `uncial-cms: edit <path>`. Falls back to `sourcePath`.
	 */
	pagePath?: string;
	blocks: BlockRegistry;
	schema: ContentSchema;
	/** The four things the session needs the host to do to its own surface. */
	ui: EditorPageUi;
	/**
	 * Debounced autosave in milliseconds. Omitted keeps saving manual, which is
	 * what a forge backend wants — there, every keystroke would be a commit.
	 */
	autosaveMs?: number;
	/** Defaults to the provider the configured forge implies. */
	sessionProvider?: SessionProvider;
	/** Defaults to `window.confirm`. */
	confirm?: (message: string) => boolean;
	/** Defaults to an anchor-driven blob download. */
	download?: (payload: { filename: string; content: string; mimeType: string }) => void;
	/** True once the host's surface has been torn down. */
	isDestroyed?: () => boolean;
}

export function forgeAdapter(config: UncialCmsSiteConfig): ForgeAdapter {
	if (config.forge === 'github') return createGitHubAdapter();
	if (config.forge === 'local') return createLocalAdapter();
	throw new Error(`Unknown forge "${(config as { forge: string }).forge}".`);
}

export function defaultSessionProvider(config: UncialCmsSiteConfig): SessionProvider {
	return config.forge === 'local' ? localSessionProvider : popupSessionProvider;
}

function triggerDownload(payload: { filename: string; content: string; mimeType: string }): void {
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

export function createEditorSession(opts: CreateEditorSessionOptions): EditorController {
	return createEditorController({
		config: opts.config,
		sourcePath: opts.sourcePath,
		pagePath: opts.pagePath,
		blocks: opts.blocks,
		schema: opts.schema,
		adapter: forgeAdapter(opts.config),
		sessionProvider: opts.sessionProvider ?? defaultSessionProvider(opts.config),
		ui: opts.ui,
		confirm: opts.confirm ?? ((message: string) => window.confirm(message)),
		download: opts.download ?? triggerDownload,
		autosaveMs: opts.autosaveMs,
		isDestroyed: opts.isDestroyed
	});
}
