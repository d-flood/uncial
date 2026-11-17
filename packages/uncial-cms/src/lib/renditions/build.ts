/**
 * Build-time renditions: walks documents for image values whose attribute
 * declares `renditions`, and writes each one with sharp. Node only.
 */
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type sharpType from 'sharp';
import type { FormatEnum } from 'sharp';
import type { AttributeSpec, BlockRegistry, ImageValue, RenditionSpec } from 'uncial';
import { mediaPath, planRenditions, type PlannedRendition } from './plan.js';

export interface RenditionJob {
	image: ImageValue | string;
	spec: RenditionSpec;
}

interface DocNode {
	type?: string;
	attrs?: Record<string, unknown>;
	content?: DocNode[];
}

function collectValue(spec: AttributeSpec<unknown>, value: unknown, jobs: RenditionJob[]): void {
	if (spec.renditions && value) {
		if (typeof value === 'string' || typeof (value as ImageValue).src === 'string') {
			jobs.push({ image: value as ImageValue | string, spec: spec.renditions });
		}
	}
	if (!spec.list || !Array.isArray(value)) return;
	const { fields, value: itemConfig } = spec.list;
	for (const item of value) {
		if (itemConfig !== undefined) collectValue(toSpec(itemConfig), item, jobs);
		if (fields && item && typeof item === 'object') {
			collectAttributes(fields, item as Record<string, unknown>, jobs);
		}
	}
}

function toSpec(config: unknown): AttributeSpec<unknown> {
	return config && typeof config === 'object' && !Array.isArray(config)
		? (config as AttributeSpec<unknown>)
		: { default: config };
}

function collectAttributes(
	specs: Record<string, unknown> | ReadonlyMap<string, AttributeSpec<unknown>>,
	values: Record<string, unknown>,
	jobs: RenditionJob[]
): void {
	const entries = specs instanceof Map ? [...specs] : Object.entries(specs);
	for (const [name, config] of entries) collectValue(toSpec(config), values[name], jobs);
}

/**
 * Every image value in `document` (its blocks and, given `metaFields`, its
 * `meta`) with the renditions its attribute declares.
 */
export function collectRenditions(
	document: { content?: unknown; meta?: unknown },
	blocks: BlockRegistry,
	metaFields?: ReadonlyMap<string, AttributeSpec<unknown>> | Record<string, AttributeSpec<unknown>>
): RenditionJob[] {
	const jobs: RenditionJob[] = [];
	const visit = (node: DocNode) => {
		const block = node.type ? blocks.get(node.type) : undefined;
		if (block && node.attrs) collectAttributes(block.attributes, node.attrs, jobs);
		node.content?.forEach(visit);
	};
	(document.content as DocNode[] | undefined)?.forEach(visit);
	if (metaFields && document.meta && typeof document.meta === 'object') {
		collectAttributes(metaFields, document.meta as Record<string, unknown>, jobs);
	}
	return jobs;
}

export interface WriteRenditionsOptions {
	/** Where the site serves `mediaDir`, e.g. `/media`. */
	mediaUrlPrefix: string;
	/** The originals on disk, i.e. `localMediaDir`. */
	sourceDir: string;
	/** The directory served at `mediaUrlPrefix`; renditions go in its `r/`. */
	outDir: string;
}

// Pages prerender concurrently and share images; one write per file at a time.
const pending = new Map<string, Promise<boolean>>();
const warned = new Set<string>();

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function loadSharp(): Promise<typeof sharpType> {
	try {
		return (await import('sharp')).default;
	} catch {
		throw new Error('Writing renditions needs `sharp`: install it alongside uncial-cms.');
	}
}

async function writeOne(
	sharp: typeof sharpType,
	source: string,
	target: string,
	planned: PlannedRendition
): Promise<boolean> {
	if (await exists(target)) return false;
	await mkdir(dirname(target), { recursive: true });
	const oriented = sharp(source).rotate();
	let pipeline = oriented;
	if (planned.aspect === undefined) {
		pipeline = oriented.resize({ width: planned.width, withoutEnlargement: true });
	} else {
		const { width = 0, height = 0, orientation = 1 } = await sharp(source).metadata();
		const [sourceWidth, sourceHeight] = orientation >= 5 ? [height, width] : [width, height];
		const cropWidth = Math.min(sourceWidth, Math.round(sourceHeight * planned.aspect));
		const cropHeight = Math.min(sourceHeight, Math.round(sourceWidth / planned.aspect));
		const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(value, 0), max));
		const outWidth = Math.min(planned.width, cropWidth);
		// Rotate before extracting, so the crop is in the oriented image's coordinates.
		pipeline = sharp(await oriented.toBuffer())
			.extract({
				left: clamp(planned.focal.x * sourceWidth - cropWidth / 2, sourceWidth - cropWidth),
				top: clamp(planned.focal.y * sourceHeight - cropHeight / 2, sourceHeight - cropHeight),
				width: cropWidth,
				height: cropHeight
			})
			.resize({ width: outWidth, height: Math.round(outWidth / planned.aspect) });
	}
	const ext = target.slice(target.lastIndexOf('.') + 1);
	const temporary = `${target}.${process.pid}.tmp`;
	await pipeline.toFormat(ext === 'jpg' ? 'jpeg' : (ext as keyof FormatEnum)).toFile(temporary);
	await rename(temporary, target);
	return true;
}

/**
 * Write every rendition `jobs` need into `<outDir>/r/`, skipping files already
 * there: a name hashes the source and every parameter, so it never goes stale.
 * Answers the paths written. A missing original is warned about once and skipped.
 */
export async function writeRenditions(
	jobs: RenditionJob[],
	opts: WriteRenditionsOptions
): Promise<string[]> {
	const work: Array<Promise<string | null>> = [];
	let sharp: typeof sharpType | undefined;
	for (const job of jobs) {
		const src = typeof job.image === 'string' ? job.image : job.image.src;
		const path = mediaPath(src, opts.mediaUrlPrefix);
		if (path === null) continue;
		const source = join(opts.sourceDir, path);
		if (!(await exists(source))) {
			if (warned.has(source)) continue;
			warned.add(source);
			console.warn(`uncial-cms: no original for ${src} at ${source}; skipping its renditions.`);
			continue;
		}
		sharp ??= await loadSharp();
		for (const planned of planRenditions(job.image, job.spec, opts.mediaUrlPrefix)) {
			const target = join(opts.outDir, planned.file);
			const inFlight = pending.get(target);
			if (inFlight) {
				work.push(inFlight.then(() => null));
				continue;
			}
			const written = writeOne(sharp, source, target, planned).finally(() =>
				pending.delete(target)
			);
			pending.set(target, written);
			work.push(written.then((fresh) => (fresh ? target : null)));
		}
	}
	return (await Promise.all(work)).filter((target): target is string => target !== null);
}
