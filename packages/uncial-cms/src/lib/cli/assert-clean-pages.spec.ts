import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { UNCIAL_CMS_RUNTIME_SENTINEL } from '../sentinel.js';
import { run } from './run.js';

let buildDir: string;

afterEach(() => {
	if (buildDir) rmSync(buildDir, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
	buildDir = mkdtempSync(join(tmpdir(), 'uncial-clean-pages-'));
	for (const [path, contents] of Object.entries(files)) {
		const file = join(buildDir, path);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, contents);
	}
	return buildDir;
}

function invoke(argv: string[]): { code: number; out: string; err: string } {
	const out: string[] = [];
	const err: string[] = [];
	const code = run(argv, { out: (line) => out.push(line), err: (line) => err.push(line) });
	return { code, out: out.join('\n'), err: err.join('\n') };
}

/** A page whose script tag pulls in one chunk, as the built site emits it. */
function pageHtml(chunk: string): string {
	return `<!doctype html><html><head><script type="module" src="/_app/immutable/${chunk}"></script></head><body></body></html>`;
}

describe('assert-clean-pages', () => {
	it('passes a content page without the sentinel beside an editor variant with it', () => {
		const dir = tree({
			'about/index.html': pageHtml('content.js'),
			'about/edit/index.html': pageHtml('editor.js'),
			'_app/immutable/content.js': 'export const a = 1;',
			'_app/immutable/editor.js': `export const s = "${UNCIAL_CMS_RUNTIME_SENTINEL}";`
		});

		const result = invoke(['assert-clean-pages', dir]);

		expect(result.code).toBe(0);
		expect(result.out).toContain('assert:clean-pages OK — 2 pages checked');
	});

	it('fails a content page whose script closure reaches a chunk with the sentinel', () => {
		const dir = tree({
			'about/index.html': pageHtml('content.js'),
			'_app/immutable/content.js': 'import "./runtime.js";',
			'_app/immutable/runtime.js': `export const s = "${UNCIAL_CMS_RUNTIME_SENTINEL}";`
		});

		const result = invoke(['assert-clean-pages', dir]);

		expect(result.code).toBe(1);
		expect(result.err).toContain('/about/ is a content page but ships uncial-cms JavaScript.');
	});

	it('fails an editor variant that does not reference the CMS runtime', () => {
		const dir = tree({
			'about/edit/index.html': pageHtml('editor.js'),
			'_app/immutable/editor.js': 'export const a = 1;'
		});

		const result = invoke(['assert-clean-pages', dir]);

		expect(result.code).toBe(1);
		expect(result.err).toContain(
			'/about/edit/ is an editor variant but does not reference the CMS runtime.'
		);
	});

	it('fails --local-only on an editor variant, however clean', () => {
		const dir = tree({
			'about/index.html': pageHtml('content.js'),
			'about/edit/index.html': pageHtml('content.js'),
			'_app/immutable/content.js': 'export const a = 1;'
		});

		const result = invoke(['assert-clean-pages', dir, '--local-only']);

		expect(result.code).toBe(1);
		expect(result.err).toContain('/about/edit/ is an editor variant');
	});

	it('fails --local-only on an orphan chunk carrying an editor-stack marker', () => {
		const dir = tree({
			'about/index.html': pageHtml('content.js'),
			'_app/immutable/content.js': 'export const a = 1;',
			'_app/immutable/orphan.js': 'const c = "ProseMirror-focused";'
		});

		const result = invoke(['assert-clean-pages', dir, '--local-only']);

		expect(result.code).toBe(1);
		expect(result.err).toContain(
			`${join('_app', 'immutable', 'orphan.js')} carries the editor stack (ProseMirror-)`
		);
	});

	it('passes --local-only on a build with no editor page and no editor stack', () => {
		const dir = tree({
			'about/index.html': pageHtml('content.js'),
			'index.html': pageHtml('content.js'),
			'_app/immutable/content.js': 'export const a = 1;'
		});

		const result = invoke(['assert-clean-pages', dir, '--local-only']);

		expect(result.code).toBe(0);
		expect(result.out).toContain('assert:clean-pages OK — 2 pages checked');
	});

	it('prints usage for --help and exits 2 for an unknown command', () => {
		expect(invoke(['--help'])).toMatchObject({ code: 0 });
		expect(invoke(['--help']).out).toContain('uncial-cms assert-clean-pages');
		expect(invoke(['doctor'])).toMatchObject({ code: 2 });
	});
});
