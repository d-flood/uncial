import { describe, expect, it } from 'vitest';
import type { GhInvoker, GhResult } from './doctor.js';
import { run } from './run.js';

const REPO = 'd-flood/uncial';

/** What each `gh` call the command makes should answer, per scenario. */
interface Scenario {
	auth?: number;
	/** Installation ids of the app slug, as the `--jq` filter yields them. */
	installations?: string;
	/** Non-zero when the installations route refuses the token, as it usually does. */
	installationsStatus?: number;
	/** Installation id → repository full names it covers. */
	installRepos?: Record<string, string>;
	login?: string;
	push?: string;
	allowlist?: Partial<GhResult>;
	pages?: Partial<GhResult>;
}

const GITHUB_IO_PAGES = JSON.stringify({ cname: null, https_enforced: true });

function ghStub(scenario: Scenario): { gh: GhInvoker; calls: string[][] } {
	const calls: string[][] = [];
	const gh: GhInvoker = async (args) => {
		calls.push(args);
		const joined = args.join(' ');
		if (joined === 'auth status') return { stdout: '', status: scenario.auth ?? 0 };
		if (joined.includes('/user/installations/')) {
			const id = joined.match(/installations\/(\d+)\//)?.[1] ?? '';
			const repos = scenario.installRepos?.[id];
			return repos === undefined ? { stdout: '', status: 1 } : { stdout: repos, status: 0 };
		}
		if (joined.includes('/user/installations')) {
			return { stdout: scenario.installations ?? '', status: scenario.installationsStatus ?? 0 };
		}
		if (joined.includes('api user')) return { stdout: scenario.login ?? 'd-flood', status: 0 };
		if (joined.includes('/permission')) return { stdout: scenario.push ?? 'true', status: 0 };
		if (joined.includes('contents/.uncial/cms.json')) {
			return {
				stdout: JSON.stringify({ allowedOrigins: ['https://d-flood.github.io'] }),
				status: 0,
				...scenario.allowlist
			};
		}
		if (joined.includes('/pages')) {
			return { stdout: GITHUB_IO_PAGES, status: 0, ...scenario.pages };
		}
		throw new Error(`unstubbed gh call: ${joined}`);
	};
	return { gh, calls };
}

const INSTALLED: Scenario = { installations: '42', installRepos: { '42': `other/site\n${REPO}` } };

async function invoke(
	argv: string[],
	scenario: Scenario
): Promise<{ code: number; out: string; err: string; calls: string[][] }> {
	const out: string[] = [];
	const err: string[] = [];
	const { gh, calls } = ghStub(scenario);
	const code = await run(
		argv,
		{ out: (line) => out.push(line), err: (line) => err.push(line) },
		gh
	);
	return { code, out: out.join('\n'), err: err.join('\n'), calls };
}

function doctorArgs(origin = 'https://d-flood.github.io'): string[] {
	return ['doctor', '--origin', origin, '--repo', REPO];
}

describe('doctor', () => {
	it('prints usage for --help', async () => {
		const result = await invoke(['doctor', '--help'], {});

		expect(result.code).toBe(0);
		expect(result.out).toContain('uncial-cms doctor --origin');
	});

	it('exits 2 without --origin', async () => {
		const result = await invoke(['doctor'], {});

		expect(result.code).toBe(2);
		expect(result.err).toContain('doctor needs --origin');
	});

	it('exits 2 with one instruction and runs no check when gh is unauthenticated', async () => {
		const result = await invoke(doctorArgs(), { auth: 1 });

		expect(result.code).toBe(2);
		expect(result.err).toContain('gh auth login');
		expect(result.calls).toEqual([['auth', 'status']]);
	});

	it('names app_not_installed when the app is on no repository', async () => {
		const result = await invoke(doctorArgs(), { installations: '' });

		expect(result.code).toBe(1);
		expect(result.err).toContain(
			'is not installed on any repository you can see (app_not_installed)'
		);
		expect(result.err).toContain('https://github.com/apps/uncial-cms/installations/new');
	});

	it('names app_not_installed when the app is installed elsewhere', async () => {
		const result = await invoke(doctorArgs(), {
			installations: '42',
			installRepos: { '42': 'other/site' }
		});

		expect(result.code).toBe(1);
		expect(result.err).toContain(`not on ${REPO} (app_not_installed)`);
	});

	it('warns rather than fails when gh cannot list App installations', async () => {
		const result = await invoke(doctorArgs(), { ...INSTALLED, installationsStatus: 1 });

		expect(result.code).toBe(0);
		expect(result.out).toContain('not authorized to a GitHub App');
		expect(result.err).toBe('');
	});

	it('warns rather than fails when an installation refuses its repository list', async () => {
		const result = await invoke(doctorArgs(), { installations: '42', installRepos: {} });

		expect(result.code).toBe(0);
		expect(result.out).toContain(`Confirm ${REPO} is among them`);
	});

	it('names no_push_permission when the user cannot push', async () => {
		const result = await invoke(doctorArgs(), { ...INSTALLED, login: 'reader', push: 'false' });

		expect(result.code).toBe(1);
		expect(result.err).toContain(
			`reader does not have push permission on ${REPO} (no_push_permission)`
		);
	});

	it('names missing_allowlist when .uncial/cms.json is absent', async () => {
		const result = await invoke(doctorArgs(), { ...INSTALLED, allowlist: { status: 1 } });

		expect(result.code).toBe(1);
		expect(result.err).toContain('.uncial/cms.json is not on the default branch');
		expect(result.err).toContain('(missing_allowlist)');
	});

	it('names missing_allowlist when the file has no allowedOrigins array', async () => {
		const result = await invoke(doctorArgs(), {
			...INSTALLED,
			allowlist: { stdout: JSON.stringify({ origins: [] }) }
		});

		expect(result.code).toBe(1);
		expect(result.err).toContain('has no "allowedOrigins" array of strings (missing_allowlist)');
	});

	it('names origin_not_allowed when the origin is not listed', async () => {
		const result = await invoke(doctorArgs('https://nobody.example'), {
			...INSTALLED,
			pages: { stdout: JSON.stringify({ cname: 'nobody.example', https_enforced: true }) }
		});

		expect(result.code).toBe(1);
		expect(result.err).toContain(
			'https://nobody.example is not in the allowlist (https://d-flood.github.io) (origin_not_allowed)'
		);
	});

	it('reads the allowlist from --branch when given', async () => {
		const result = await invoke([...doctorArgs(), '--branch', 'trunk'], {
			...INSTALLED,
			allowlist: { status: 1 }
		});

		expect(result.err).toContain('.uncial/cms.json is not on trunk');
		expect(result.calls.some((args) => args.join(' ').includes('cms.json?ref=trunk'))).toBe(true);
	});

	it('fails with the Pages settings URL when Pages is disabled', async () => {
		const result = await invoke(doctorArgs(), { ...INSTALLED, pages: { status: 1 } });

		expect(result.code).toBe(1);
		expect(result.err).toContain(`GitHub Pages is not enabled for ${REPO}`);
		expect(result.err).toContain(`https://github.com/${REPO}/settings/pages`);
	});

	it('skips the Pages probe under --no-pages, for a site deployed elsewhere', async () => {
		const result = await invoke([...doctorArgs('https://www.example.com'), '--no-pages'], {
			...INSTALLED,
			allowlist: { stdout: JSON.stringify({ allowedOrigins: ['https://www.example.com'] }) },
			// Pages is off; without the opt-out this would be a failing probe.
			pages: { status: 1 }
		});

		expect(result.code).toBe(0);
		expect(result.out).toContain('skipped the GitHub Pages probe');
		expect(result.calls.some((args) => args.join(' ').endsWith('/pages'))).toBe(false);
	});

	it('fails a custom-domain origin whose Pages cname does not match', async () => {
		const result = await invoke(doctorArgs('https://www.example.com'), {
			...INSTALLED,
			allowlist: { stdout: JSON.stringify({ allowedOrigins: ['https://www.example.com'] }) },
			pages: { stdout: JSON.stringify({ cname: 'example.com', https_enforced: false }) }
		});

		expect(result.code).toBe(1);
		expect(result.err).toContain('the Pages custom domain is example.com, not www.example.com');
		expect(result.err).toContain('Pages does not enforce HTTPS for www.example.com');
	});

	it('passes a custom-domain origin whose Pages cname matches and enforces HTTPS', async () => {
		const result = await invoke(doctorArgs('https://www.example.com'), {
			...INSTALLED,
			allowlist: { stdout: JSON.stringify({ allowedOrigins: ['https://www.example.com'] }) },
			pages: { stdout: JSON.stringify({ cname: 'www.example.com', https_enforced: true }) }
		});

		expect(result.code).toBe(0);
		expect(result.out).toContain('the Pages custom domain is www.example.com');
		expect(result.out).not.toContain('shared origin');
	});

	it('warns without failing that a github.io origin is shared', async () => {
		const result = await invoke(doctorArgs(), INSTALLED);

		expect(result.code).toBe(0);
		expect(result.out).toContain('d-flood.github.io is a shared origin');
	});

	it('exits 0 with every check green', async () => {
		const result = await invoke(doctorArgs(), INSTALLED);

		expect(result.code).toBe(0);
		expect(result.err).toBe('');
		expect(result.out.split('\n').filter((line) => line.startsWith('✓'))).toHaveLength(6);
	});

	it('defaults the repository to the current checkout', async () => {
		const { gh, calls } = ghStub(INSTALLED);
		const withRepoView: GhInvoker = (args) =>
			args[0] === 'repo' ? Promise.resolve({ stdout: REPO, status: 0 }) : gh(args);
		const out: string[] = [];

		const code = await run(
			['doctor', '--origin=https://d-flood.github.io'],
			{ out: (line) => out.push(line), err: () => {} },
			withRepoView
		);

		expect(code).toBe(0);
		expect(calls.some((args) => args.join(' ').includes(`repos/${REPO}/pages`))).toBe(true);
	});
});
