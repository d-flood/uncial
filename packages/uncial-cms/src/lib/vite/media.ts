import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Plugin, ResolvedConfig } from 'vite';
import type { Site, SiteOptions } from '../define-site.js';
import { contains } from '../local/vite.js';
import { writeRenditions, type RenditionJob } from '../renditions/build.js';
import { planRenditions } from '../renditions/plan.js';
import { repositoryRoot } from '../repository-root.js';

const CONTENT_TYPES: Record<string, string> = {
	'.avif': 'image/avif',
	'.gif': 'image/gif',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.mp3': 'audio/mpeg',
	'.mp4': 'video/mp4',
	'.pdf': 'application/pdf',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain; charset=utf-8',
	'.webm': 'video/webm',
	'.webp': 'image/webp'
};

const ENTRY = 'virtual:uncial-cms-renditions';
// The build's own module, so a source checkout loads `.ts` and a package `.js`.
const JOBS_MODULE = fileURLToPath(
	new URL(`../renditions/jobs${extname(fileURLToPath(import.meta.url))}`, import.meta.url)
);

const trimSlashes = (path: string) => path.replace(/^\/+|\/+$/g, '');

async function isFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

/**
 * Serves and ships the local media dir at `mediaUrlPrefix` unless it sits in the
 * static dir, and writes and serves the renditions the site module's content
 * declares. Null without `mediaUrlPrefix` or a media dir.
 */
export function mediaPlugin(
	options: SiteOptions,
	sitePath: string | undefined
): { plugin: Plugin; contentChanged: () => void } | null {
	const { mediaUrlPrefix, mediaDir: dir, localMediaDir } = options;
	if (!mediaUrlPrefix || !(localMediaDir || dir)) return null;
	const root = repositoryRoot(options.contentDir, options.localContentDir);
	const mediaDir = localMediaDir ? resolve(localMediaDir) : resolve(root, trimSlashes(dir!));
	// The framework already serves and copies originals under its static dir.
	const servesOriginals = !contains(resolve(root, options.staticDir ?? 'static'), mediaDir);
	const prefix = trimSlashes(mediaUrlPrefix);

	let config: ResolvedConfig;
	let site: string | undefined;
	let cacheDir: string;
	let manifest: string;
	let entryRef: string | undefined;
	let ready: Promise<void> | undefined;
	let refresh = () => {};

	/** Writes the renditions `jobs` need into the cache and answers their files. */
	async function writeAll(jobs: RenditionJob[]): Promise<string[]> {
		if (jobs.length === 0) return [];
		await writeRenditions(jobs, { mediaUrlPrefix: prefix, sourceDir: mediaDir, outDir: cacheDir });
		const files = new Set(
			jobs.flatMap((job) => planRenditions(job.image, job.spec, prefix).map(({ file }) => file))
		);
		const written = await Promise.all(
			[...files].map(async (file) => (await isFile(join(cacheDir, file))) && file)
		);
		return written.filter((file): file is string => file !== false);
	}

	async function mediaFiles(): Promise<string[]> {
		try {
			const entries = await readdir(mediaDir, { recursive: true, withFileTypes: true });
			return entries
				.filter((entry) => entry.isFile())
				.map((entry) =>
					join(entry.parentPath, entry.name)
						.slice(mediaDir.length + 1)
						.split(sep)
						.join('/')
				);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw error;
		}
	}

	const plugin: Plugin = {
		name: 'uncial-cms:media',
		configResolved(resolved) {
			config = resolved;
			site = sitePath && resolve(config.root, sitePath);
			cacheDir = resolve(config.root, 'node_modules/.uncial/renditions');
			manifest = join(cacheDir, 'build.json');
		},
		configureServer(server) {
			if (site) {
				const load = async () => {
					const { site: loaded } = (await server.ssrLoadModule(site!)) as { site: Site };
					const { renditionJobs } = (await server.ssrLoadModule(
						JOBS_MODULE
					)) as typeof import('../renditions/jobs.js');
					await writeAll(await renditionJobs(loaded));
				};
				refresh = () => {
					ready = (ready ?? Promise.resolve())
						.then(load)
						.catch((error: Error) =>
							config.logger.error(`uncial-cms: renditions failed: ${error.stack ?? error.message}`)
						);
				};
				// Not before listening: Astro's build starts a dev server it never listens on.
				server.httpServer?.once('listening', refresh);
			}
			const urlPrefix = `${config.base}${prefix}/`;
			server.middlewares.use((request, response, next) => {
				const path = request.url?.split('?', 1)[0] ?? '';
				if (!path.startsWith(urlPrefix)) return next();
				void (async () => {
					let name: string;
					try {
						name = decodeURIComponent(path.slice(urlPrefix.length));
					} catch {
						name = '\0';
					}
					const rendition = site !== undefined && name.startsWith('r/');
					if (!rendition && !servesOriginals) return next();
					const dir = rendition ? cacheDir : mediaDir;
					const target = resolve(dir, name);
					if (name.includes('\0') || !contains(dir, target)) {
						response.statusCode = 400;
						response.end();
						return;
					}
					if (rendition) {
						if (!ready) refresh();
						await ready;
					}
					if (!(await isFile(target))) return next();
					response.setHeader(
						'Content-Type',
						CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream'
					);
					createReadStream(target).on('error', next).pipe(response);
				})().catch(next);
			});
		},
		resolveId(id) {
			return id === ENTRY ? `\0${ENTRY}` : undefined;
		},
		load(id) {
			if (id !== `\0${ENTRY}`) return;
			return `export { site } from ${JSON.stringify(site)};\nexport { renditionJobs } from ${JSON.stringify(JOBS_MODULE)};`;
		},
		async buildStart() {
			if (config.command !== 'build' || !site || !config.build.ssr) return;
			await rm(manifest, { force: true });
			entryRef = this.emitFile({ type: 'chunk', id: ENTRY, preserveSignature: 'strict' });
		},
		// The SSR build is the one that can run the site module, and SvelteKit starts
		// its client build from its own sequential writeBundle, so this must run first.
		writeBundle: {
			order: 'pre',
			sequential: true,
			async handler(output) {
				if (entryRef === undefined) return;
				const entry = join(output.dir ?? config.build.outDir, this.getFileName(entryRef));
				entryRef = undefined;
				const loaded = (await import(pathToFileURL(entry).href)) as {
					site: Site;
					renditionJobs: (site: Site) => Promise<RenditionJob[]>;
				};
				const files = await writeAll(await loaded.renditionJobs(loaded.site));
				await mkdir(cacheDir, { recursive: true });
				await writeFile(manifest, JSON.stringify(files));
			}
		},
		async generateBundle() {
			if (config.build.ssr) return;
			for (const name of servesOriginals ? await mediaFiles() : []) {
				this.emitFile({
					type: 'asset',
					fileName: `${prefix}/${name}`,
					source: await readFile(join(mediaDir, name))
				});
			}
			if (!site || !(await isFile(manifest))) return;
			for (const file of JSON.parse(await readFile(manifest, 'utf8')) as string[]) {
				this.emitFile({
					type: 'asset',
					fileName: `${prefix}/${file}`,
					source: await readFile(join(cacheDir, file))
				});
			}
		}
	};
	return { plugin, contentChanged: () => refresh() };
}
