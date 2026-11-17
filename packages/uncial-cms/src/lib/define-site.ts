/**
 * The Site object: the Site config plus the Content model, declared once. The
 * config resolves for the current build: the local forge while developing, the
 * declared GitHub forge in a production build, and a local-only site when no
 * GitHub half is declared.
 */
import {
	createContentModel,
	normalizeDocument,
	type ContentDocument,
	type ContentModel,
	type ContentModelOptions,
	type ContentSchema,
	type DocumentMetaSchema,
	type MetaValues
} from 'uncial';
import type { FileSource, ImageSource } from 'uncial/editor';
import { DEFAULT_APP_SLUG, DEFAULT_AUTH_WORKER_URL } from './constants.js';
import { DEFAULT_DEPLOY_STATUS_TIMINGS, type DeployStatusTimings } from './deploy-status.js';
import { cmsFileSource, cmsImageSource } from './image-source.js';
import { rendition } from './renditions/index.js';
import type {
	GitHubSiteConfig,
	LocalSiteConfig,
	ServerSiteConfig,
	SessionProvider,
	UncialCmsSiteConfig
} from './types.js';

/** A Global: one meta-only record the Dashboard edits, stored at `<contentDir>/_globals/<name>.json`. */
export interface GlobalDeclaration {
	label?: string;
	meta: DocumentMetaSchema;
}

/** A Collection: meta-only records stored at `<dir>/<slug>.json`, never Content pages. */
export interface CollectionDeclaration {
	/** Repo-root-relative, like `contentDir`; on the server forge, a path prefix in the store. */
	dir: string;
	label?: string;
	meta: DocumentMetaSchema;
}

export type Globals = Record<string, GlobalDeclaration>;
export type Collections = Record<string, CollectionDeclaration>;

/** How authors sign in to the GitHub forge: the auth worker (the default) or a code-exchange broker. */
export type SiteAuth =
	| { kind: 'worker'; url?: string; appSlug?: string }
	| { kind: 'broker'; origin: string; clientId: string; appSlug: string };

export interface SiteModelOptions<
	Fields extends DocumentMetaSchema = DocumentMetaSchema
> extends ContentModelOptions<Fields> {
	/** Replaces the Media source derived from the Site config, `staticDir` and `base`. */
	media?: ImageSource;
	/** Replaces the file source derived the same way. */
	files?: FileSource;
}

export interface SiteOptions<G extends Globals = Globals, C extends Collections = Collections> {
	/** Repo-root-relative content directory, as the forge APIs address it. */
	contentDir: string;
	/** FS path of that directory at build time; defaults to `contentDir`. */
	localContentDir?: string;
	/** Repo-root-relative directory the build copies to the site root. Default 'static'. */
	staticDir?: string;
	/** Repo-root-relative directory uploaded media commits into. */
	mediaDir?: string;
	/** FS path of `mediaDir` in development; defaults to where it sits beside `localContentDir`. */
	localMediaDir?: string;
	/** Site-root URL path `mediaDir` is served under, for media outside the static dir. */
	mediaUrlPrefix?: string;
	/** Omit for a local-only site: one with no forge to commit to. */
	github?: {
		repo: string;
		branch: string;
		/** Save Drafts on branches off `branch`, published into it on demand. */
		drafts?: boolean;
		auth?: SiteAuth;
	};
	/** Honoured only when the resolved forge is local; a forge commit is never autosaved. */
	autosaveMs?: number;
	/**
	 * How long the post-save status line waits on the pipeline. A site whose
	 * build outlasts the default five-minute timeout says so here, or every save
	 * ends on "status unknown". Each field falls back to its default.
	 */
	deployStatus?: Partial<DeployStatusTimings>;
	globals?: G;
	collections?: C;
}

export interface Site<
	Config extends UncialCmsSiteConfig = UncialCmsSiteConfig,
	G extends Globals = Globals,
	Meta extends Record<string, unknown> = Record<string, unknown>,
	C extends Collections = Collections
> extends ContentModel<Meta> {
	config: Config;
	/** No GitHub half was declared, so this site is only editable in development. */
	localOnly: boolean;
	autosaveMs: number | undefined;
	localContentDir: string;
	deployStatusTimings: DeployStatusTimings;
	globals: G;
	collections: C;
	staticDir: string;
	media: ImageSource;
	files: FileSource;
	/** Normalizes a stored document against the Block registry and its Template's schema. */
	normalize(document: Partial<ContentDocument> | null | undefined): ContentDocument;
	/** Loads the provider the resolved forge and `github.auth` imply on first sign-in. */
	sessionProvider: SessionProvider;
}

function resolveDeployStatusTimings(
	overrides: Partial<DeployStatusTimings> = {}
): DeployStatusTimings {
	return {
		firstDelayMs: overrides.firstDelayMs ?? DEFAULT_DEPLOY_STATUS_TIMINGS.firstDelayMs,
		intervalMs: overrides.intervalMs ?? DEFAULT_DEPLOY_STATUS_TIMINGS.intervalMs,
		timeoutMs: overrides.timeoutMs ?? DEFAULT_DEPLOY_STATUS_TIMINGS.timeoutMs
	};
}

function lazySessionProvider(load: () => Promise<SessionProvider>): SessionProvider {
	let provider: Promise<SessionProvider> | undefined;
	return async (config) => (await (provider ??= load()))(config);
}

function siteFields<Config extends UncialCmsSiteConfig, Fields extends DocumentMetaSchema>(
	config: Config,
	model: SiteModelOptions<Fields>,
	staticDir: string,
	sessionProvider: () => Promise<SessionProvider>
) {
	const mediaUrlPrefix = config.forge === 'server' ? undefined : config.mediaUrlPrefix;
	const contentModel = createContentModel({
		...model,
		renditions:
			model.renditions ??
			(mediaUrlPrefix
				? (value, spec, crop) => rendition(value, spec, { mediaUrlPrefix, crop })
				: undefined)
	});
	const sourceOptions = { base: contentModel.base, staticDir };
	return {
		...contentModel,
		config,
		staticDir,
		media: model.media ?? cmsImageSource(config, sourceOptions),
		files: model.files ?? cmsFileSource(config, sourceOptions),
		normalize: (document: Partial<ContentDocument> | null | undefined) =>
			normalizeDocument(document, contentModel.blocks, contentModel.schemaFor(document?.meta)),
		sessionProvider: lazySessionProvider(sessionProvider)
	};
}

export function defineSite<
	G extends Globals = {},
	Fields extends DocumentMetaSchema = DocumentMetaSchema,
	C extends Collections = {}
>(
	options: SiteOptions<G, C>,
	model: SiteModelOptions<Fields>,
	env: { dev: boolean } = { dev: import.meta.env.DEV }
): Site<GitHubSiteConfig | LocalSiteConfig, G, MetaValues<Fields>, C> {
	const localOnly = options.github === undefined;
	const auth: SiteAuth = options.github?.auth ?? { kind: 'worker' };
	const config: GitHubSiteConfig | LocalSiteConfig =
		env.dev || options.github === undefined
			? {
					forge: 'local',
					contentDir: options.contentDir,
					mediaDir: options.mediaDir,
					mediaUrlPrefix: options.mediaUrlPrefix
				}
			: {
					forge: 'github',
					repo: options.github.repo,
					branch: options.github.branch,
					contentDir: options.contentDir,
					authWorkerUrl: (auth.kind === 'worker' ? auth.url : undefined) ?? DEFAULT_AUTH_WORKER_URL,
					appSlug: auth.appSlug ?? DEFAULT_APP_SLUG,
					mediaDir: options.mediaDir,
					mediaUrlPrefix: options.mediaUrlPrefix,
					drafts: options.github.drafts
				};
	const base = model.base ?? '';
	return {
		...siteFields(config, model, options.staticDir ?? 'static', async () => {
			if (config.forge === 'local')
				return (await import('./local/session.js')).localSessionProvider;
			if (auth.kind === 'broker') {
				const { brokerSessionProvider } = await import('./github/broker.js');
				return brokerSessionProvider({
					brokerOrigin: auth.origin,
					clientId: auth.clientId,
					appSlug: auth.appSlug,
					basePath: base
				});
			}
			return (await import('./github/popup.js')).popupSessionProvider;
		}),
		localOnly,
		autosaveMs: config.forge === 'local' ? options.autosaveMs : undefined,
		localContentDir: options.localContentDir ?? options.contentDir,
		deployStatusTimings: resolveDeployStatusTimings(options.deployStatus),
		globals: options.globals ?? ({} as G),
		collections: options.collections ?? ({} as C)
	};
}

export interface ServerSiteOptions<
	G extends Globals = Globals,
	C extends Collections = Collections
> {
	/** The host endpoint serving `createServerContentHandlers`, e.g. '/dashboard/api/content'. */
	apiBase: string;
	mediaApiBase?: string;
	/** Autosave writes only the Draft, so a server site may autosave. */
	autosaveMs?: number;
	globals?: G;
	collections?: C;
}

/** A site whose content lives behind the host's own endpoints, in every build. */
export function defineServerSite<
	G extends Globals = {},
	Fields extends DocumentMetaSchema = DocumentMetaSchema,
	C extends Collections = {}
>(
	options: ServerSiteOptions<G, C>,
	model: SiteModelOptions<Fields>
): Site<ServerSiteConfig, G, MetaValues<Fields>, C> {
	const config: ServerSiteConfig = {
		forge: 'server',
		apiBase: options.apiBase,
		mediaApiBase: options.mediaApiBase
	};
	return {
		...siteFields(
			config,
			model,
			'static',
			async () => (await import('./server-forge/session.js')).serverSessionProvider
		),
		localOnly: false,
		autosaveMs: options.autosaveMs,
		localContentDir: '',
		deployStatusTimings: resolveDeployStatusTimings(),
		globals: options.globals ?? ({} as G),
		collections: options.collections ?? ({} as C)
	};
}

/** The values of a Site object's base meta fields. */
export type MetaOf<S extends Site> =
	ReturnType<S['schemaFor']> extends ContentSchema<infer Meta> ? Meta : never;
