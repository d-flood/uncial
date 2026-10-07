import type { ContentSchema } from 'uncial/core';
import type { Site } from '../define-site.js';
import type { Action } from '../server-forge/protocol.js';
import type { SessionProvider, UncialCmsSiteConfig } from '../types.js';
import type { DashboardSection } from './routes.js';

export type DashboardAction = Action;

export interface DashboardOptions {
	config: UncialCmsSiteConfig | Site;
	blocks: unknown;
	schema: unknown;
	globals?: Record<string, ContentSchema>;
	editorHref?: (pagePath: string) => string;
	can?: (action: DashboardAction, subject?: unknown) => boolean;
	appSections?: Array<{ id: string; label: string; href?: string }>;
	signOutHref?: string;
	basePath?: string;
	theme?: 'light' | 'dark' | 'system';
	sessionProvider?: SessionProvider;
	/** Site-relative page path → source path. Must match the one baked into the Editor variants. */
	mapPathToSource?: (path: string) => string;
	mapSourceToPath?: (source: string) => string;
	editorStylesheets?: string[];
	/** Repo-root-relative dir the build serves at the site root, as `cmsImageSource` takes it. Default 'static'. */
	staticDir?: string;
}

export type DashboardProps = DashboardOptions & {
	sections?: DashboardSection[];
};
