/**
 * The provisioning checks a site owner would otherwise learn about from a
 * failed sign-in: the GitHub App installed on the repository, the Allowlist
 * committed to the default branch naming the site's origin, and Pages serving
 * that origin. Each failure names the auth worker refusal it would produce.
 *
 * Every fact comes from the authenticated `gh` CLI through one injectable
 * invoker, so the specs never touch the network and the command never needs a
 * token of its own.
 */
import { execFile } from 'node:child_process';
import { DEFAULT_APP_SLUG } from '../define-site.js';
import type { CliOutput } from './assert-clean-pages.js';

export interface GhResult {
	stdout: string;
	/** Process exit status; a non-zero status is a refusal, never a throw. */
	status: number;
}

export type GhInvoker = (args: string[]) => Promise<GhResult>;

export interface DoctorOptions {
	/** The site's origin, as the Allowlist and the auth worker spell it. */
	origin: string;
	/** `owner/name`; defaults to the repository `gh` sees in the working tree. */
	repo?: string;
	appSlug?: string;
	/** Ref the Allowlist is read from; defaults to the repository's default branch. */
	branch?: string;
}

/** Runs the real `gh`. A missing binary is a non-zero status, not an exception. */
export function ghCli(): GhInvoker {
	return (args) =>
		new Promise((resolve) => {
			execFile('gh', args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
				const code = (error as { code?: unknown } | null)?.code;
				resolve({ stdout, status: error === null ? 0 : typeof code === 'number' ? code : 1 });
			});
		});
}

const GH_INSTRUCTION =
	'`gh` is missing or not authenticated. Install it from https://cli.github.com and run `gh auth login`, then run this command again.';

class Report {
	private failed = false;

	constructor(private readonly io: CliOutput) {}

	pass(line: string): void {
		this.io.out(`✓ ${line}`);
	}

	/** `code` is the auth worker refusal this failure would have produced. */
	fail(line: string, fix: string, code?: string): void {
		this.failed = true;
		this.io.err(`✗ ${line}${code ? ` (${code})` : ''}`);
		this.io.err(`  Fix: ${fix}`);
	}

	warn(line: string): void {
		this.io.out(`! ${line}`);
	}

	get exitCode(): number {
		return this.failed ? 1 : 0;
	}
}

/** Non-empty trimmed lines of a `--jq` result. */
function lines(stdout: string): string[] {
	return stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function parseJson(stdout: string): unknown {
	try {
		return JSON.parse(stdout);
	} catch {
		return undefined;
	}
}

async function checkAppInstalled(
	gh: GhInvoker,
	report: Report,
	repo: string,
	appSlug: string
): Promise<void> {
	// `GET /repos/{owner}/{repo}/installation` needs App auth, so ask the
	// installations the authenticated user can see which repositories they cover.
	const installations = await gh([
		'api',
		'--paginate',
		'/user/installations',
		'--jq',
		`.installations[] | select(.app_slug == "${appSlug}") | .id`
	]);
	const installUrl = `https://github.com/apps/${appSlug}/installations/new`;
	// A `gh auth login` token is not authorized to a GitHub App, so this route
	// answers 403 for most users. That is unknown, not absent: reporting it as a
	// failure would make every real run red on a check nothing here can settle.
	if (installations.status !== 0) {
		report.warn(
			`could not list "${appSlug}" App installations — \`gh\`'s token is not authorized to a GitHub App. Confirm the install by eye at ${installUrl}.`
		);
		return;
	}

	const ids = lines(installations.stdout);
	if (ids.length === 0) {
		report.fail(
			`the "${appSlug}" GitHub App is not installed on any repository you can see`,
			`install it at ${installUrl}`,
			'app_not_installed'
		);
		return;
	}

	let refused = false;
	for (const id of ids) {
		const repositories = await gh([
			'api',
			'--paginate',
			`/user/installations/${id}/repositories`,
			'--jq',
			'.repositories[].full_name'
		]);
		if (repositories.status !== 0) {
			refused = true;
			continue;
		}
		if (lines(repositories.stdout).some((name) => name.toLowerCase() === repo.toLowerCase())) {
			report.pass(`the "${appSlug}" GitHub App is installed on ${repo}`);
			return;
		}
	}

	if (refused) {
		report.warn(
			`could not list the repositories the "${appSlug}" App is installed on. Confirm ${repo} is among them at ${installUrl}.`
		);
		return;
	}

	report.fail(
		`the "${appSlug}" GitHub App is installed, but not on ${repo}`,
		`grant it access to ${repo} at ${installUrl}`,
		'app_not_installed'
	);
}

async function checkPushPermission(gh: GhInvoker, report: Report, repo: string): Promise<void> {
	const user = await gh(['api', 'user', '--jq', '.login']);
	const login = lines(user.stdout)[0];
	if (user.status !== 0 || login === undefined) {
		report.fail(
			'could not read the authenticated user from `gh`',
			'run `gh auth status` and re-authenticate',
			'no_push_permission'
		);
		return;
	}

	const permission = await gh([
		'api',
		`repos/${repo}/collaborators/${login}/permission`,
		'--jq',
		'.user.permissions.push'
	]);
	if (permission.status === 0 && lines(permission.stdout)[0] === 'true') {
		report.pass(`${login} has push permission on ${repo}`);
		return;
	}
	report.fail(
		`${login} does not have push permission on ${repo}`,
		`ask an admin of ${repo} for write access — the editor commits as you`,
		'no_push_permission'
	);
}

async function checkAllowlist(
	gh: GhInvoker,
	report: Report,
	repo: string,
	origin: string,
	branch: string | undefined
): Promise<void> {
	const ref = branch === undefined ? '' : `?ref=${branch}`;
	const where = branch === undefined ? 'the default branch' : `${branch}`;
	const file = await gh([
		'api',
		'-H',
		'Accept: application/vnd.github.raw',
		`repos/${repo}/contents/.uncial/cms.json${ref}`
	]);
	if (file.status !== 0) {
		report.fail(
			`.uncial/cms.json is not on ${where} of ${repo}`,
			`commit { "allowedOrigins": ["${origin}"] } to .uncial/cms.json on ${where}`,
			'missing_allowlist'
		);
		return;
	}

	const parsed = parseJson(file.stdout);
	const allowed =
		typeof parsed === 'object' && parsed !== null
			? (parsed as { allowedOrigins?: unknown }).allowedOrigins
			: undefined;
	if (!Array.isArray(allowed) || allowed.some((entry) => typeof entry !== 'string')) {
		report.fail(
			`.uncial/cms.json on ${where} of ${repo} has no "allowedOrigins" array of strings`,
			`make it { "allowedOrigins": ["${origin}"] }`,
			'missing_allowlist'
		);
		return;
	}

	report.pass(`.uncial/cms.json on ${where} of ${repo} lists ${allowed.length} origin(s)`);

	if (allowed.includes(origin)) {
		report.pass(`${origin} is allowlisted`);
		return;
	}
	report.fail(
		`${origin} is not in the allowlist (${allowed.join(', ') || 'empty'})`,
		`add "${origin}" to allowedOrigins in .uncial/cms.json — the worker matches the origin string exactly`,
		'origin_not_allowed'
	);
}

async function checkPages(
	gh: GhInvoker,
	report: Report,
	repo: string,
	host: string
): Promise<void> {
	const settingsUrl = `https://github.com/${repo}/settings/pages`;
	const pages = await gh(['api', `repos/${repo}/pages`]);
	if (pages.status !== 0) {
		report.fail(`GitHub Pages is not enabled for ${repo}`, `enable it at ${settingsUrl}`);
		return;
	}
	report.pass(`GitHub Pages is enabled for ${repo}`);

	if (host.endsWith('.github.io')) return;

	const settings = parseJson(pages.stdout) as
		{ cname?: unknown; https_enforced?: unknown } | undefined;
	const cname = typeof settings?.cname === 'string' ? settings.cname : null;
	if (cname !== host) {
		report.fail(
			`the Pages custom domain is ${cname ?? 'unset'}, not ${host}`,
			`set the custom domain to ${host} at ${settingsUrl}`
		);
	} else {
		report.pass(`the Pages custom domain is ${host}`);
	}

	if (settings?.https_enforced === true) {
		report.pass('Pages enforces HTTPS');
	} else {
		report.fail(
			`Pages does not enforce HTTPS for ${host}`,
			`tick "Enforce HTTPS" at ${settingsUrl} once the certificate is issued`
		);
	}
}

/**
 * Exit 0 when every check passes, 1 when one fails, and 2 when the command
 * could not run at all — no authenticated `gh`, or no repository to check.
 */
export async function doctor(
	options: DoctorOptions,
	io: CliOutput,
	gh: GhInvoker = ghCli()
): Promise<number> {
	let origin: URL;
	try {
		origin = new URL(options.origin);
	} catch {
		io.err(`"${options.origin}" is not a URL — pass an origin like https://example.com.`);
		return 2;
	}

	const auth = await gh(['auth', 'status']);
	if (auth.status !== 0) {
		io.err(GH_INSTRUCTION);
		return 2;
	}

	let repo = options.repo;
	if (repo === undefined) {
		const view = await gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
		repo = view.status === 0 ? lines(view.stdout)[0] : undefined;
		if (repo === undefined) {
			io.err(
				'Could not determine the repository — run this in a checkout or pass --repo owner/name.'
			);
			return 2;
		}
	}

	const appSlug = options.appSlug ?? DEFAULT_APP_SLUG;
	const report = new Report(io);

	report.pass('`gh` is installed and authenticated');
	await checkAppInstalled(gh, report, repo, appSlug);
	await checkPushPermission(gh, report, repo);
	await checkAllowlist(gh, report, repo, origin.origin, options.branch);
	await checkPages(gh, report, repo, origin.host);

	if (origin.host.endsWith('.github.io')) {
		report.warn(
			`${origin.host} is a shared origin: allowlisting it authorises every project page served from it. A custom domain restores per-site granularity.`
		);
	}

	return report.exitCode;
}
