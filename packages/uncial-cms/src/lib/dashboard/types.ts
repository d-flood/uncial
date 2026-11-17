import type { Site } from '../define-site.js';
import type { Action } from '../server-forge/protocol.js';
import type { DashboardSection } from './routes.js';

export type DashboardAction = Action;

export interface DashboardOptions {
	/** The Site object: its config, Content model, Globals, Collections, base, static dir and sign-in. */
	site: Site;
	editorHref?: (pagePath: string) => string;
	can?: (action: DashboardAction, subject?: unknown) => boolean;
	appSections?: Array<{ id: string; label: string; href?: string }>;
	signOutHref?: string;
	theme?: 'light' | 'dark' | 'system';
}

export type DashboardProps = DashboardOptions & {
	sections?: DashboardSection[];
};
