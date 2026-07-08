import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SSR-hygiene guard (plan item 4.3): the `render/` entry graph must never reach the
 * editor mount stack. Importing `uncial/render` on a server must not pull in Tiptap,
 * `BlockNodeView`, `mount()`/`unmount()`, or the runes-based reactive-props helper.
 *
 * This walks the *source* import graph statically (following relative specifiers only)
 * starting from `render/index.ts` and fails if any reachable module lives under
 * `lib/editor/` or `lib/runtime/` (the latter holds `svelte.ts` + `reactiveProps.svelte.ts`,
 * the mount machinery). If someone re-adds `import … from '../runtime/svelte.js'` to a
 * render module, this test goes red.
 */

const here = dirname(fileURLToPath(import.meta.url));
const libRoot = resolve(here, '..');

const FORBIDDEN_DIRS = ['editor', 'runtime'];

// Matches `from '…'`, `import '…'`, and `import('…')` (incl. `import type`).
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function resolveSpecifier(fromFile: string, spec: string): string | null {
	if (!spec.startsWith('.')) return null; // bare/package import — not part of our source graph
	const base = resolve(dirname(fromFile), spec);
	const candidates = [
		base,
		base.replace(/\.js$/, '.ts'),
		base.replace(/\.js$/, '.svelte.ts'),
		`${base}.ts`,
		`${base}.svelte`,
		`${base}/index.ts`
	];
	for (const candidate of candidates) {
		try {
			readFileSync(candidate);
			return candidate;
		} catch {
			// try next candidate
		}
	}
	return null;
}

function walk(entry: string): { visited: Set<string>; edges: Map<string, string> } {
	const visited = new Set<string>();
	const edges = new Map<string, string>(); // child -> parent (for a readable failure chain)
	const stack = [entry];
	while (stack.length) {
		const file = stack.pop()!;
		if (visited.has(file)) continue;
		visited.add(file);
		const source = readFileSync(file, 'utf8');
		for (const match of source.matchAll(IMPORT_RE)) {
			const target = resolveSpecifier(file, match[1]);
			if (target && !visited.has(target)) {
				if (!edges.has(target)) edges.set(target, file);
				stack.push(target);
			}
		}
	}
	return { visited, edges };
}

function chainTo(edges: Map<string, string>, file: string): string {
	const parts = [file];
	let current = file;
	while (edges.has(current)) {
		current = edges.get(current)!;
		parts.push(current);
	}
	return parts
		.reverse()
		.map((p) => p.slice(libRoot.length + 1))
		.join(' → ');
}

describe('render/ SSR import hygiene', () => {
	it('never reaches the editor mount stack', () => {
		const { visited, edges } = walk(resolve(libRoot, 'render/index.ts'));
		const offenders = [...visited]
			.filter((file) => {
				const rel = file.slice(libRoot.length + 1);
				const top = rel.split('/')[0];
				return FORBIDDEN_DIRS.includes(top);
			})
			.map((file) => chainTo(edges, file));
		expect(offenders, `render graph reached forbidden modules:\n${offenders.join('\n')}`).toEqual(
			[]
		);
	});
});
