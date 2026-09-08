/**
 * Proves `uncial-cms assert-clean-pages --local-only` against real builds: the
 * local-only fixture site passes it, and the same site with a GitHub half fails
 * it while still passing the default mode.
 *
 * Its own script rather than a Playwright project: it drives no browser, and
 * `test:unit` stays free of two production builds.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const site = join(packageRoot, 'e2e/local-only-site');
const bin = join(packageRoot, 'dist/cli/bin.js');

function build(name, env) {
	execFileSync(resolve(packageRoot, 'node_modules/.bin/vite'), ['build'], {
		cwd: site,
		stdio: 'inherit',
		env: {
			...process.env,
			BUILD_DIR: resolve(packageRoot, '.e2e-build', name),
			KIT_OUT_DIR: resolve(packageRoot, `.svelte-kit-e2e-${name}`),
			...env
		}
	});
	return resolve(packageRoot, '.e2e-build', name);
}

function gate(buildDir, args) {
	const result = spawnSync(process.execPath, [bin, 'assert-clean-pages', buildDir, ...args], {
		encoding: 'utf-8'
	});
	return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

const failures = [];
function expectExit(label, result, code) {
	if (result.code === code) {
		console.log(`ok — ${label}`);
		return;
	}
	failures.push(`${label}: expected exit ${code}, got ${result.code}\n${result.output}`);
}

if (!existsSync(bin)) {
	execFileSync('pnpm', ['run', 'package'], { cwd: packageRoot, stdio: 'inherit' });
}

const localOnly = build('local-only', { UNCIAL_FIXTURE_GITHUB: '' });
expectExit('a local-only build passes --local-only', gate(localOnly, ['--local-only']), 0);

const githubHalf = build('github-half', { UNCIAL_FIXTURE_GITHUB: '1' });
expectExit('a build with a GitHub half fails --local-only', gate(githubHalf, ['--local-only']), 1);
expectExit('a build with a GitHub half passes the default mode', gate(githubHalf, []), 0);

if (failures.length > 0) {
	console.error(`\ntest:cli FAILED`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('\ntest:cli OK');
