/**
 * The published-entrypoint smoke test: pack `uncial` and `uncial-cms` as
 * `pnpm publish` would, install the tarballs into a bare SvelteKit site outside
 * this workspace, and build and gate it.
 *
 * Every consumer in this repository resolves the two packages from source
 * through aliases, so nothing else exercises `dist/` and `exports` as an
 * installer sees them — which is how a peer specifier baked into the packaged
 * output once reached a tarball.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const template = join(repoRoot, 'packages/uncial-cms/smoke/site');

/**
 * Pinned into the fixture from the workspace's own ranges, so the site is built
 * against the toolchain this repository tests against.
 * `@sveltejs/vite-plugin-svelte` is a peer of `@sveltejs/kit`, so a bare site
 * has to declare it.
 */
const FIXTURE_DEV_DEPENDENCIES = [
	'@sveltejs/adapter-static',
	'@sveltejs/kit',
	'@sveltejs/vite-plugin-svelte',
	'svelte',
	'svelte-check',
	'typescript',
	'vite'
];

const workDir = mkdtempSync(join(tmpdir(), 'uncial-smoke-'));
const packDir = join(workDir, 'packs');
const siteDir = join(workDir, 'site');

let currentStep = null;

function step(name) {
	currentStep = name;
	console.log(`\n→ ${name}`);
}

function fail(message) {
	console.error(`\nsmoke:packed FAILED at "${currentStep}"`);
	console.error(`  ${message}`);
	console.error(`\nThe fixture is left in place for inspection:\n  ${workDir}`);
	process.exit(1);
}

function run(command, args, cwd) {
	const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
	if (result.error) fail(`${command} could not be spawned: ${result.error.message}`);
	if (result.status !== 0) fail(`${command} ${args.join(' ')} exited ${result.status}`);
}

function readJson(path) {
	return JSON.parse(readFileSync(path, 'utf-8'));
}

/** `pnpm pack` rewrites `workspace:` ranges to real semver; `npm pack` does not. */
function pack(packageDir, tarball) {
	const out = join(packDir, tarball);
	run('pnpm', ['pack', '--out', out], packageDir);
	return out;
}

step('prepack uncial');
run('pnpm', ['--filter', 'uncial', 'run', 'prepack'], repoRoot);

step('prepack uncial-cms');
run('pnpm', ['--filter', 'uncial-cms', 'run', 'prepack'], repoRoot);

step('pack the tarballs');
const uncialTarball = pack(join(repoRoot, 'packages/uncial'), 'uncial.tgz');
const cmsTarball = pack(join(repoRoot, 'packages/uncial-cms'), 'uncial-cms.tgz');

step('write the fixture');
cpSync(template, siteDir, { recursive: true });
const workspaceRanges = readJson(join(repoRoot, 'packages/uncial-cms/package.json')).devDependencies;
const manifest = readFileSync(join(template, 'package.json'), 'utf-8')
	.replace('__UNCIAL_TARBALL__', `file:${uncialTarball}`)
	.replace('__UNCIAL_CMS_TARBALL__', `file:${cmsTarball}`);
const pkg = JSON.parse(manifest);
pkg.devDependencies = Object.fromEntries(
	FIXTURE_DEV_DEPENDENCIES.map((name) => {
		const range = workspaceRanges[name];
		if (range === undefined) fail(`uncial-cms declares no range for "${name}".`);
		return [name, range];
	})
);
writeFileSync(join(siteDir, 'package.json'), `${JSON.stringify(pkg, null, '\t')}\n`);
console.log(`  ${siteDir}`);

// `--no-frozen-lockfile` because the fixture ships none, and pnpm turns
// `frozen-lockfile` on by itself in CI.
step('install the tarballs');
run('pnpm', ['install', '--no-frozen-lockfile'], siteDir);

step('svelte-kit sync');
run('pnpm', ['exec', 'svelte-kit', 'sync'], siteDir);

step('svelte-check');
run('pnpm', ['exec', 'svelte-check', '--tsconfig', './tsconfig.json'], siteDir);

step('vite build');
run('pnpm', ['exec', 'vite', 'build'], siteDir);

step('assert-clean-pages');
run('pnpm', ['exec', 'uncial-cms', 'assert-clean-pages', 'build'], siteDir);

// Vite is not in the graph here: the subpath has to resolve for a plain Node
// script, which is the point of `uncial-cms/paths` being its own entrypoint.
step('resolve uncial-cms/paths from plain node');
run(
	process.execPath,
	[
		'--input-type=module',
		'-e',
		[
			"import { hashForPagePath } from 'uncial-cms/paths';",
			"if (hashForPagePath('about') !== '#/about/') throw new Error('unexpected mapping');",
			"console.log('  uncial-cms/paths resolved');"
		].join('\n')
	],
	siteDir
);

rmSync(workDir, { recursive: true, force: true });
console.log('\nsmoke:packed OK');
