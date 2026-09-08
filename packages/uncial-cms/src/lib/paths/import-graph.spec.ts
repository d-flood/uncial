import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const libRoot = resolve(here, '..');
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function resolveSpecifier(fromFile: string, specifier: string): string | null {
	if (!specifier.startsWith('.')) return null;
	const base = resolve(dirname(fromFile), specifier);
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
			// Try the next source-file form supported by the package build.
		}
	}
	return null;
}

function relativePath(file: string): string {
	return file.slice(libRoot.length + 1);
}

function chainTo(edges: Map<string, string>, file: string): string {
	const files = [file];
	let current = file;
	while (edges.has(current)) {
		current = edges.get(current)!;
		files.push(current);
	}
	return files.reverse().map(relativePath).join(' → ');
}

function findBareImports(entry: string): string[] {
	const visited = new Set<string>();
	const edges = new Map<string, string>();
	const offenders: string[] = [];
	const stack = [entry];

	while (stack.length > 0) {
		const file = stack.pop()!;
		if (visited.has(file)) continue;
		visited.add(file);

		const source = readFileSync(file, 'utf8');
		for (const match of source.matchAll(IMPORT_RE)) {
			const specifier = match[1];
			if (!specifier.startsWith('.')) {
				offenders.push(`${chainTo(edges, file)} → ${specifier}`);
				continue;
			}

			const target = resolveSpecifier(file, specifier);
			if (target && !visited.has(target)) {
				if (!edges.has(target)) edges.set(target, file);
				stack.push(target);
			}
		}
	}

	return offenders;
}

describe('paths import graph', () => {
	it('contains no bare imports', () => {
		const offenders = findBareImports(resolve(here, 'index.ts'));
		expect(offenders, `paths graph reached bare imports:\n${offenders.join('\n')}`).toEqual([]);
	});
});
