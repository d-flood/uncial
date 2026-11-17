/**
 * The published-entrypoint smoke test: pack `uncial` and `uncial-cms` as
 * `pnpm publish` would, install the tarballs into a bare SvelteKit skeleton
 * outside this workspace, scaffold it with the packed `uncial-cms init`, and
 * build and gate it, local-only and then with a GitHub half.
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

function run(command, args, cwd, stdio = 'inherit') {
	const result = spawnSync(command, args, { cwd, stdio, encoding: 'utf-8' });
	if (result.error) fail(`${command} could not be spawned: ${result.error.message}`);
	if (stdio !== 'inherit') process.stdout.write(result.stdout + result.stderr);
	if (result.status !== 0) fail(`${command} ${args.join(' ')} exited ${result.status}`);
	return result.stdout;
}

function edit(path, find, replace) {
	const source = readFileSync(path, 'utf-8');
	if (!source.includes(find)) fail(`${path} has no "${find}" to edit.`);
	writeFileSync(path, source.replace(find, replace));
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
const workspaceRanges = readJson(
	join(repoRoot, 'packages/uncial-cms/package.json')
).devDependencies;
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

step('uncial-cms init');
const initOutput = run('pnpm', ['exec', 'uncial-cms', 'init'], siteDir, 'pipe');
const printed = initOutput.split('\n').map((line) => line.trim());
const written = printed.filter((line) => line.startsWith('wrote ')).length;
const imports = printed.filter((line) => line.startsWith('import '));
const plugins = printed.find((line) => line.startsWith('plugins: '));
const prerender = printed.find((line) => line.startsWith('prerender: '));
if (written === 0 || imports.length === 0 || plugins === undefined || prerender === undefined) {
	fail('init wrote no files or printed no Vite or svelte.config line.');
}

step('add the printed Vite and svelte.config lines');
const viteConfig = join(siteDir, 'vite.config.ts');
writeFileSync(viteConfig, `${imports.join('\n')}\n${readFileSync(viteConfig, 'utf-8')}`);
edit(viteConfig, 'plugins: [sveltekit()]', plugins);
edit(join(siteDir, 'svelte.config.js'), 'kit: {', `kit: {\n\t\t${prerender},`);

step('uncial-cms init again writes nothing');
const rerun = run('pnpm', ['exec', 'uncial-cms', 'init'], siteDir, 'pipe').split('\n');
const skipped = rerun.filter((line) => line.trim().startsWith('skipped ')).length;
if (rerun.some((line) => line.trim().startsWith('wrote ')) || skipped !== written) {
	fail(`a second init must skip all ${written} files; it skipped ${skipped}.`);
}

step('vite build, local-only');
run('pnpm', ['exec', 'vite', 'build'], siteDir);

step('assert-clean-pages --local-only');
run('pnpm', ['exec', 'uncial-cms', 'assert-clean-pages', 'build', '--local-only'], siteDir);

// So the Editor variants prerender and the gate's default mode is exercised.
step('add a GitHub half');
edit(
	join(siteDir, 'site.options.ts'),
	"staticDir: 'static'",
	"staticDir: 'static',\n\tgithub: { repo: 'uncial-smoke/site', branch: 'main' }"
);

step('svelte-kit sync');
run('pnpm', ['exec', 'svelte-kit', 'sync'], siteDir);

step('svelte-check');
run('pnpm', ['exec', 'svelte-check', '--tsconfig', './tsconfig.json'], siteDir);

step('vite build');
run('pnpm', ['exec', 'vite', 'build'], siteDir);

step('assert-clean-pages');
run('pnpm', ['exec', 'uncial-cms', 'assert-clean-pages', 'build'], siteDir);

// Resolution only: importing the root also loads uncial's Svelte components, which need Vite.
step('resolve uncial-cms from plain node');
run(
	process.execPath,
	[
		'--input-type=module',
		'-e',
		"console.log('  uncial-cms resolved to', import.meta.resolve('uncial-cms'));"
	],
	siteDir
);

// What an `astro.config` does, without Astro installed.
step('import uncial-cms/astro from plain node');
run(process.execPath, ['--input-type=module', '-e', "await import('uncial-cms/astro');"], siteDir);

rmSync(workDir, { recursive: true, force: true });
console.log('\nsmoke:packed OK');
