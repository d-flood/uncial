/**
 * The zero-CMS-JS build gate against Astro's asset layout: reader pages must
 * ship none of the editor's JavaScript, and every editor page must ship it.
 *
 * It is stricter than the SvelteKit gate in two ways. Dynamic imports are
 * followed, because an Astro page has no router lazily importing other routes:
 * a dynamic import reachable from a page is code that page may run. And a
 * reader page fails on the editor stack as well as the sentinel, which catches
 * the editor imported directly, without the sentinel-bearing surface.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { UNCIAL_CMS_RUNTIME_SENTINEL } from '../sentinel.js';
import { EDITOR_STACK_MARKERS, walk, type CliOutput } from './assert-clean-pages.js';

const SENTINEL_NAME = 'uncial-cms runtime sentinel';

const MARKERS: ReadonlyArray<readonly [string, RegExp]> = [
	[SENTINEL_NAME, new RegExp(UNCIAL_CMS_RUNTIME_SENTINEL)],
	...EDITOR_STACK_MARKERS
];

function markersIn(source: string): string[] {
	return MARKERS.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

/**
 * Map a URL from the page or a chunk to a file in the build directory. Astro
 * emits its bundles under `_astro/`, so those resolve from that segment whatever
 * base path prefixes them; other root-relative URLs are files from `public/`.
 * Off-site URLs resolve to nothing.
 */
function resolveAsset(buildDir: string, url: string): string | null {
	const marker = url.indexOf('_astro/');
	if (marker !== -1) return join(buildDir, url.slice(marker));
	if (url.startsWith('/') && !url.startsWith('//')) return join(buildDir, url);
	return null;
}

function readSource(file: string, cache: Map<string, string | null>): string | null {
	if (!cache.has(file)) {
		try {
			cache.set(file, readFileSync(file, 'utf-8'));
		} catch {
			cache.set(file, null); // external or non-emitted reference
		}
	}
	return cache.get(file) ?? null;
}

/**
 * Every JS file a page can load: script and preload tags, the component and
 * renderer URLs of Astro islands, imports in inline module scripts, and then,
 * transitively, each chunk's static and dynamic imports.
 */
function scriptClosure(
	buildDir: string,
	html: string,
	cache: Map<string, string | null>
): Set<string> {
	const queue: string[] = [];
	const urls = [
		...html.matchAll(
			/(?:src|href|component-url|renderer-url|before-hydration-url)="([^"]+\.m?js)"/g
		),
		...html.matchAll(/import\s*\(?\s*["']([^"']+\.m?js)["']/g)
	];
	for (const [, url] of urls) {
		const resolved = resolveAsset(buildDir, url);
		if (resolved) queue.push(resolved);
	}
	const seen = new Set<string>();
	while (queue.length > 0) {
		const file = queue.pop() as string;
		if (seen.has(file)) continue;
		seen.add(file);
		const source = readSource(file, cache);
		if (source === null) continue;
		for (const [, spec] of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+\.m?js)["']/g)) {
			if (spec.startsWith('.')) queue.push(join(dirname(file), spec));
			else {
				const resolved = resolveAsset(buildDir, spec);
				if (resolved) queue.push(resolved);
			}
		}
	}
	return seen;
}

/** Editor markers on a page, each named with the file that carries it. */
function pageFindings(buildDir: string, htmlPath: string, cache: Map<string, string | null>): string[] {
	const html = readFileSync(htmlPath, 'utf-8');
	// The stack markers are looked for only in inline script bodies, since page
	// prose may mention them; the sentinel counts anywhere, as an attribute too.
	const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
		.map(([, body]) => body)
		.join('\n');
	const findings = markersIn(inline).map((name) => `${name} in an inline script`);
	if (html.includes(UNCIAL_CMS_RUNTIME_SENTINEL)) findings.push(`${SENTINEL_NAME} in the page`);
	for (const file of scriptClosure(buildDir, html, cache)) {
		const source = readSource(file, cache);
		if (source === null) continue;
		for (const name of markersIn(source)) findings.push(`${name} in ${relative(buildDir, file)}`);
	}
	return findings;
}

/** Site-relative page path of an HTML file, as the failure messages name it. */
function pageOf(buildDir: string, htmlPath: string): string {
	const rel = relative(buildDir, htmlPath).split('\\').join('/');
	if (rel === 'index.html') return '/';
	return rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`;
}

export function assertCleanAstroPages(buildDir: string, io: CliOutput): number {
	let htmlFiles: string[];
	try {
		htmlFiles = walk(buildDir).filter((path) => path.endsWith('.html'));
	} catch {
		htmlFiles = [];
	}
	if (htmlFiles.length === 0) {
		io.err(`No pages found under "${buildDir}" — build the site first.`);
		return 1;
	}

	const cache = new Map<string, string | null>();
	const failures: string[] = [];
	for (const htmlPath of htmlFiles) {
		const page = pageOf(buildDir, htmlPath);
		const findings = pageFindings(buildDir, htmlPath, cache);
		if (page.endsWith('/edit/')) {
			if (!findings.some((finding) => finding.startsWith(SENTINEL_NAME))) {
				failures.push(`${page} is an editor page but does not reference the CMS runtime.`);
			}
		} else if (page !== '/uncial/' && findings.length > 0) {
			failures.push(`${page} is a reader page but ships the editor runtime: ${findings.join('; ')}.`);
		}
	}

	if (failures.length > 0) {
		io.err('assert:clean-pages FAILED');
		for (const failure of failures) io.err(`  - ${failure}`);
		return 1;
	}
	io.out(
		`assert:clean-pages OK — ${htmlFiles.length} pages checked, reader pages ship no editor runtime.`
	);
	return 0;
}
