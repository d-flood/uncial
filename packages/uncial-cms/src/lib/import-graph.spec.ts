import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const cmsLib = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(cmsLib, '../../..');
const uncialLib = resolve(packagesDir, 'uncial/src/lib');

// Parses, so import text inside strings (astro/integration.ts's codegen) is skipped; `import()` stays lazy.
function runtimeImports(file: string): string[] {
	const text = readFileSync(file, 'utf8');
	const script = file.endsWith('.svelte')
		? [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(([, body]) => body).join('\n')
		: text;
	return ts
		.createSourceFile(file, script, ts.ScriptTarget.Latest)
		.statements.flatMap((node) =>
			(ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) ||
			(ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier)
				? [(node.moduleSpecifier as ts.StringLiteral).text]
				: []
		);
}

const BROWSER_SESSION = [
	'editor-session.ts',
	'github/popup.ts',
	'github/broker.ts',
	'local/session.ts',
	'server-forge/session.ts'
].map((path) => resolve(cmsLib, path));

function forbidden(spec: string, file: string | null): boolean {
	if (
		spec.endsWith('.css') ||
		/^(@tiptap\/|prosemirror-|uncial\/(editor|web-components|styles))/.test(spec)
	) {
		return true;
	}
	if (file === null) return false;
	if (file.startsWith(uncialLib))
		return /^(editor|web-components)\//.test(relative(uncialLib, file));
	return file.startsWith(cmsLib) && (file.endsWith('.svelte') || BROWSER_SESSION.includes(file));
}

function packageEntry(spec: string): string | null {
	const match = /^(uncial-cms|uncial)(\/.*)?$/.exec(spec);
	if (!match) return null;
	const [, name, subpath = ''] = match;
	const pkg = JSON.parse(readFileSync(resolve(packagesDir, name!, 'package.json'), 'utf8'));
	const target: string | undefined = pkg.exports[`.${subpath}`]?.default;
	if (!target) throw new Error(`${spec} is not an export of ${name}`);
	return resolve(packagesDir, name!, target.replace('./dist/', 'src/lib/').replace(/\.js$/, '.ts'));
}

function resolveImport(fromFile: string, spec: string): string | null {
	if (!spec.startsWith('.')) return packageEntry(spec);
	const base = resolve(dirname(fromFile), spec);
	const candidates = [
		base,
		base.replace(/\.js$/, '.ts'),
		base.replace(/\.js$/, '.svelte.ts'),
		`${base}.ts`,
		`${base}/index.ts`
	];
	const found = candidates.find(
		(candidate) => existsSync(candidate) && statSync(candidate).isFile()
	);
	if (!found) throw new Error(`Cannot resolve ${spec} from ${relative(packagesDir, fromFile)}`);
	return found;
}

function offenders(entry: string, isForbidden = forbidden): string[] {
	const parents = new Map<string, string>([[entry, '']]);
	const chain = (file: string): string[] =>
		file ? [...chain(parents.get(file)!), relative(packagesDir, file)] : [];
	const found: string[] = [];
	const stack = [entry];
	while (stack.length) {
		const file = stack.pop()!;
		for (const spec of runtimeImports(file)) {
			const target = isForbidden(spec, null) ? null : resolveImport(file, spec);
			if (isForbidden(spec, target)) {
				found.push([...chain(file), spec].join(' → '));
			} else if (target && !parents.has(target)) {
				parents.set(target, file);
				stack.push(target);
			}
		}
	}
	return found;
}

describe('server-safe import graph', () => {
	it.each([
		['uncial', packageEntry('uncial')!],
		['uncial-cms', packageEntry('uncial-cms')!],
		['uncial-cms/sveltekit', packageEntry('uncial-cms/sveltekit')!],
		['uncial-cms/server', packageEntry('uncial-cms/server')!],
		['a Site object built from Block modules', resolve(cmsLib, '../fixtures/site.ts')]
	])('%s reaches no editor, web component, Tiptap, CSS or browser-only module', (_, entry) => {
		const found = offenders(entry);
		expect(found, `reached forbidden modules:\n${found.join('\n')}`).toEqual([]);
	});

	it('uncial-cms/astro, which astro.config loads in plain Node, reaches no uncial runtime or .svelte', () => {
		const found = offenders(
			packageEntry('uncial-cms/astro')!,
			(spec, file) => /^uncial(\/|$)/.test(spec) || Boolean(file?.endsWith('.svelte'))
		);
		expect(found, `reached:\n${found.join('\n')}`).toEqual([]);
	});
});
