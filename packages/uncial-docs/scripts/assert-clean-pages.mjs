// Asserts the zero-CMS-JS guarantee against the built docs site: no Docs page
// (Content page) HTML file — nor any JS chunk it references, transitively — may
// contain the uncial-cms runtime sentinel, while every /edit/ page (Editor
// variant) must. The `/uncial/` index page is exempt (it mounts the CMS listing
// runtime). Copied from packages/uncial-cms so uncial-docs owns its own CI gate.
// Usage: node scripts/assert-clean-pages.mjs [buildDir]
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const SENTINEL = 'uncial-cms-runtime-sentinel-v1';
const buildDir = process.argv[2] ?? 'build';

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

const htmlFiles = walk(buildDir).filter((path) => path.endsWith('index.html'));
if (htmlFiles.length === 0) {
	console.error(`No pages found under "${buildDir}" — build the site first.`);
	process.exit(1);
}

// Map an href/src (which may include a BASE_PATH prefix) to a file in buildDir:
// everything the app emits lives under _app/, so resolve from that segment.
function resolveAppAsset(url) {
	const marker = url.indexOf('_app/');
	return marker === -1 ? null : join(buildDir, url.slice(marker));
}

/** All JS files reachable from the HTML: script/link tags, then static imports. */
function scriptClosure(html) {
	const queue = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)]
		.map(([, url]) => resolveAppAsset(url))
		.filter(Boolean);
	// Inline module scripts import chunks by absolute (base-prefixed) URL too.
	for (const [, url] of html.matchAll(/import\(?["']([^"']+\.js)["']/g)) {
		const resolved = resolveAppAsset(url);
		if (resolved) queue.push(resolved);
	}
	const seen = new Set();
	while (queue.length > 0) {
		const file = queue.pop();
		if (seen.has(file)) continue;
		seen.add(file);
		let source;
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
				const resolved = resolveAppAsset(spec);
				if (resolved) queue.push(resolved);
			}
		}
	}
	return seen;
}

function pageContainsSentinel(htmlPath) {
	const html = readFileSync(htmlPath, 'utf-8');
	if (html.includes(SENTINEL)) return true;
	for (const file of scriptClosure(html)) {
		if (readFileSync(file, 'utf-8').includes(SENTINEL)) return true;
	}
	return false;
}

const failures = [];
for (const htmlPath of htmlFiles) {
	const page = `/${relative(buildDir, dirname(htmlPath))}/`.replace(/^\/\.\/$/, '/');
	const isEditPage = page.endsWith('/edit/');
	const isIndexPage = page === '/uncial/';
	const hasSentinel = pageContainsSentinel(htmlPath);

	if (isEditPage && !hasSentinel) {
		failures.push(`${page} is an editor variant but does not reference the CMS runtime.`);
	} else if (!isEditPage && !isIndexPage && hasSentinel) {
		failures.push(`${page} is a content page but ships uncial-cms JavaScript.`);
	}
}

if (failures.length > 0) {
	console.error('assert:clean-pages FAILED');
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log(
	`assert:clean-pages OK — ${htmlFiles.length} pages checked, content pages are sentinel-free.`
);
