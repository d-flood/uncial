import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertCleanAstroPages } from '../cli/assert-clean-astro-pages.js';

const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const fixture = join(packageRoot, 'e2e/astro-site');
const buildDir = join(packageRoot, '.e2e-build/astro');

function gate(dir: string): { code: number; err: string } {
	const err: string[] = [];
	const code = assertCleanAstroPages(dir, { out: () => {}, err: (line) => err.push(line) });
	return { code, err: err.join('\n') };
}

function htmlPages(dir: string): string[] {
	return readdirSync(dir, { recursive: true, encoding: 'utf-8' })
		.filter((file) => file.endsWith('index.html'))
		.map((file) => `/${file.replace(/index\.html$/, '')}`)
		.sort();
}

describe('an Astro site built on uncial-cms/astro', () => {
	beforeAll(() => {
		execFileSync(join(packageRoot, 'node_modules/.bin/astro'), ['build'], {
			cwd: fixture,
			stdio: 'pipe'
		});
	}, 120_000);

	it('emits a reader and an editor page for every content document', () => {
		expect(htmlPages(buildDir)).toEqual([
			'/',
			'/about/',
			'/about/edit/',
			'/edit/',
			'/guide/start/',
			'/guide/start/edit/',
			'/uncial/'
		]);
	});

	it('renders the document on its reader page', () => {
		const html = readFileSync(join(buildDir, 'guide/start/index.html'), 'utf-8');
		expect(html).toContain('<title>Start</title>');
		expect(html).toMatch(/<p>.*Start body.*<\/p>/);
	});

	it('keeps the editor out of every reader page and puts it on every editor page', () => {
		expect(gate(buildDir)).toEqual({ code: 0, err: '' });
	});

	it('would fail a reader page that loaded the editor', () => {
		const copy = mkdtempSync(join(tmpdir(), 'uncial-astro-'));
		try {
			cpSync(buildDir, copy, { recursive: true });
			cpSync(join(copy, 'about/edit/index.html'), join(copy, 'about/index.html'));
			const result = gate(copy);
			expect(result.code).toBe(1);
			expect(result.err).toMatch(/\/about\/ is a reader page but ships the editor runtime/);
		} finally {
			rmSync(copy, { recursive: true, force: true });
		}
	});
});
