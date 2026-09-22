/**
 * One declaration of a site's CMS configuration, resolved for the current
 * build: the local forge while developing, the declared GitHub forge in a
 * production build, and a local-only site when no GitHub half is declared.
 */
import {
	DEFAULT_DEPLOY_STATUS_TIMINGS,
	type DeployStatusTimings
} from './deploy-status.js';
import type { UncialCmsSiteConfig } from './types.js';

/** The auth worker this project operates for sites using the canonical GitHub App. */
export const DEFAULT_AUTH_WORKER_URL = 'https://uncial-cms-auth.dflood.workers.dev';
/** The canonical GitHub App a site installs on its repository. */
export const DEFAULT_APP_SLUG = 'uncial-cms';

export interface SiteOptions {
	/** Repo-root-relative content directory, as the forge APIs address it. */
	contentDir: string;
	/** FS path of that directory at build time; defaults to `contentDir`. */
	localContentDir?: string;
	/** Repo-root-relative directory uploaded media commits into. */
	mediaDir?: string;
	/** Omit for a local-only site: one with no forge to commit to. */
	github?: {
		repo: string;
		branch: string;
		authWorkerUrl?: string;
		appSlug?: string;
	};
	/** Honoured only when the resolved forge is local; a forge commit is never autosaved. */
	autosaveMs?: number;
	/**
	 * How long the post-save status line waits on the pipeline. A site whose
	 * build outlasts the default five-minute timeout says so here, or every save
	 * ends on "status unknown". Each field falls back to its default.
	 */
	deployStatus?: Partial<DeployStatusTimings>;
}

export interface Site {
	config: UncialCmsSiteConfig;
	/** No GitHub half was declared, so this site is only editable in development. */
	localOnly: boolean;
	autosaveMs: number | undefined;
	localContentDir: string;
	deployStatusTimings: DeployStatusTimings;
}

function resolveDeployStatusTimings(overrides: Partial<DeployStatusTimings> = {}): DeployStatusTimings {
	return {
		firstDelayMs: overrides.firstDelayMs ?? DEFAULT_DEPLOY_STATUS_TIMINGS.firstDelayMs,
		intervalMs: overrides.intervalMs ?? DEFAULT_DEPLOY_STATUS_TIMINGS.intervalMs,
		timeoutMs: overrides.timeoutMs ?? DEFAULT_DEPLOY_STATUS_TIMINGS.timeoutMs
	};
}

export function defineSite(
	options: SiteOptions,
	env: { dev: boolean } = { dev: import.meta.env.DEV }
): Site {
	const localOnly = options.github === undefined;
	const config: UncialCmsSiteConfig =
		env.dev || options.github === undefined
			? { forge: 'local', contentDir: options.contentDir, mediaDir: options.mediaDir }
			: {
					forge: 'github',
					repo: options.github.repo,
					branch: options.github.branch,
					contentDir: options.contentDir,
					authWorkerUrl: options.github.authWorkerUrl ?? DEFAULT_AUTH_WORKER_URL,
					appSlug: options.github.appSlug ?? DEFAULT_APP_SLUG,
					mediaDir: options.mediaDir
				};
	return {
		config,
		localOnly,
		autosaveMs: config.forge === 'local' ? options.autosaveMs : undefined,
		localContentDir: options.localContentDir ?? options.contentDir,
		deployStatusTimings: resolveDeployStatusTimings(options.deployStatus)
	};
}
