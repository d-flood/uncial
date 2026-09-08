/**
 * The zero-CMS-JS build gate: Content pages must ship none of this package's
 * JavaScript, Editor variants must ship it, and a local-only site's production
 * build must carry no editor stack at all.
 *
 * Node only, and deliberately dependency-free apart from the sentinel: the
 * published `bin` runs this against a build directory with nothing installed
 * but the package itself.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { UNCIAL_CMS_RUNTIME_SENTINEL } from '../sentinel.js';

/** Where the command writes; the specs collect it instead of printing it. */
export interface CliOutput {
	out(line: string): void;
	err(line: string): void;
}

export interface AssertCleanPagesOptions {
	/** Assert a local-only site: no Editor variant, and no editor stack anywhere. */
	localOnly?: boolean;
}

/**
 * Names the editor stack cannot be bundled without, and that nothing else in a
 * built site carries. The ProseMirror marker is its class-name prefix rather
 * than the bare word: `ProseMirror-focused` and its siblings are string
 * literals in prosemirror-view that survive minification, while the bare word
 * also appears in a validation message uncial's renderer ships — prose about a
 * document format, not a copy of the library.
 */
const EDITOR_STACK_MARKERS: ReadonlyArray<readonly [string, RegExp]> = [
	['tiptap', /tiptap/i],
	['ProseMirror-', /ProseMirror-/],
	['uncial-editor', /uncial-editor/]
];

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

/**
 * Map an href/src (which may include a BASE_PATH prefix) to a file in the build
 * directory: everything the app emits lives under `_app/`, so resolve from that
 * segment.
 */
function resolveAppAsset(buildDir: string, url: string): string | null {
	const marker = url.indexOf('_app/');
	return marker === -1 ? null : join(buildDir, url.slice(marker));
}

/** All JS files reachable from the HTML: script/link tags, then static imports. */
function scriptClosure(buildDir: string, html: string): Set<string> {
	const queue: string[] = [];
	for (const [, url] of html.matchAll(/(?:src|href)="([^"]+\.js)"/g)) {
		const resolved = resolveAppAsset(buildDir, url);
		if (resolved) queue.push(resolved);
	}
	// Inline module scripts import chunks by absolute (base-prefixed) URL too.
	for (const [, url] of html.matchAll(/import\(?["']([^"']+\.js)["']/g)) {
		const resolved = resolveAppAsset(buildDir, url);
		if (resolved) queue.push(resolved);
	}
	const seen = new Set<string>();
	while (queue.length > 0) {
		const file = queue.pop() as string;
		if (seen.has(file)) continue;
		seen.add(file);
		let source: string;
		try {
			source = readFileSync(file, 'utf-8');
		} catch {
			continue; // external or non-emitted reference
		}
		// Static imports only: the kit router *dynamically* imports every route
		// module lazily, and those never load on a content page.
		for (const [, spec] of source.matchAll(/(?:from|import)\s*["']([^"']+\.js)["']/g)) {
			if (spec.startsWith('.')) queue.push(join(dirname(file), spec));
			else {
				const resolved = resolveAppAsset(buildDir, spec);
				if (resolved) queue.push(resolved);
			}
		}
	}
	return seen;
}

function pageContainsSentinel(buildDir: string, htmlPath: string): boolean {
	const html = readFileSync(htmlPath, 'utf-8');
	if (html.includes(UNCIAL_CMS_RUNTIME_SENTINEL)) return true;
	for (const file of scriptClosure(buildDir, html)) {
		if (readFileSync(file, 'utf-8').includes(UNCIAL_CMS_RUNTIME_SENTINEL)) return true;
	}
	return false;
}

/** Site-relative page path of an `index.html`, as the failure messages name it. */
function pageOf(buildDir: string, htmlPath: string): string {
	return `/${relative(buildDir, dirname(htmlPath))}/`.replace(/^\/\.\/$/, '/');
}

export function assertCleanPages(
	buildDir: string,
	options: AssertCleanPagesOptions,
	io: CliOutput
): number {
	let files: string[];
	try {
		files = walk(buildDir);
	} catch {
		io.err(`No pages found under "${buildDir}" — build the site first.`);
		return 1;
	}

	const htmlFiles = files.filter((path) => path.endsWith('index.html'));
	if (htmlFiles.length === 0) {
		io.err(`No pages found under "${buildDir}" — build the site first.`);
		return 1;
	}

	const failures: string[] = [];
	for (const htmlPath of htmlFiles) {
		const page = pageOf(buildDir, htmlPath);
		const isEditPage = page.endsWith('/edit/');
		const isIndexPage = page === '/uncial/';
		const hasSentinel = pageContainsSentinel(buildDir, htmlPath);

		if (isEditPage && !options.localOnly && !hasSentinel) {
			failures.push(`${page} is an editor variant but does not reference the CMS runtime.`);
		} else if (!isEditPage && !isIndexPage && hasSentinel) {
			failures.push(`${page} is a content page but ships uncial-cms JavaScript.`);
		}
		if (options.localOnly && isEditPage) {
			failures.push(`${page} is an editor variant, but a local-only build must ship none.`);
		}
	}

	if (options.localOnly) {
		for (const file of files) {
			let source: string;
			try {
				source = readFileSync(file, 'utf-8');
			} catch {
				continue;
			}
			const name = relative(buildDir, file);
			if (source.includes(UNCIAL_CMS_RUNTIME_SENTINEL)) {
				failures.push(`${name} carries the CMS runtime sentinel (${UNCIAL_CMS_RUNTIME_SENTINEL}).`);
			}
			for (const [marker, pattern] of EDITOR_STACK_MARKERS) {
				if (pattern.test(source)) failures.push(`${name} carries the editor stack (${marker}).`);
			}
		}
	}

	if (failures.length > 0) {
		io.err('assert:clean-pages FAILED');
		for (const failure of failures) io.err(`  - ${failure}`);
		return 1;
	}

	io.out(
		`assert:clean-pages OK — ${htmlFiles.length} pages checked, content pages are sentinel-free.`
	);
	return 0;
}
