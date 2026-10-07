import { UncialDashboardElement } from './dashboard/element.js';
import type { SessionProvider, UncialCmsSiteConfig } from './types.js';

/** @deprecated Render `<uncial-dashboard>`, which takes these options as properties. */
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
	/** Open pages in the host's own editing view instead of the Fallback editor. */
	editorHref?: (pagePath: string) => string;
}

/** @deprecated Render `<uncial-dashboard>`; this mounts it showing only Pages. */
export function mountIndexPage(
	target: HTMLElement,
	opts: MountIndexPageOptions
): { destroy(): void } {
	const element = new UncialDashboardElement();
	Object.assign(element, opts, { sections: ['pages'] });
	target.append(element);
	return { destroy: () => element.remove() };
}
