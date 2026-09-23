/** Argument parsing and dispatch for the `uncial-cms` command. */
import { assertCleanPages } from './assert-clean-pages.js';
import type { CliOutput } from './assert-clean-pages.js';
import { DEFAULT_APP_SLUG } from '../define-site.js';
import { doctor } from './doctor.js';
import type { GhInvoker } from './doctor.js';

const USAGE = `uncial-cms — build gates and provisioning checks for a site that edits itself

Usage:
  uncial-cms assert-clean-pages [buildDir] [--local-only]

    Assert that Content pages ship no uncial-cms JavaScript and that every
    Editor variant does. buildDir defaults to "build".

    --local-only  Assert a local-only site's production build instead: no
                  Editor variant exists, and no file in the build carries the
                  CMS runtime sentinel or the editor stack.

  uncial-cms doctor --origin <https://host> [--repo owner/name]
                    [--app-slug <slug>] [--branch <ref>] [--no-pages]

    Check, through the authenticated \`gh\` CLI, that the GitHub App is
    installed on the repository, that .uncial/cms.json is committed and lists
    the origin, and that Pages serves it. Each failure names the auth worker
    refusal it would have produced.

    --origin     The site's origin, spelled as the allowlist spells it.
    --repo       Defaults to the repository of the current checkout.
    --app-slug   Defaults to "${DEFAULT_APP_SLUG}".
    --branch     Ref the allowlist is read from; defaults to the default branch.
    --no-pages   Skip the Pages probe, for a site deployed somewhere else.

  uncial-cms --help    Print this message.`;

export const consoleOutput: CliOutput = {
	out: (line) => console.log(line),
	err: (line) => console.error(line)
};

/** Flags taking a value, in either `--flag value` or `--flag=value` form. */
function parseFlags(
	rest: string[],
	names: readonly string[],
	booleans: readonly string[] = []
): { values: Record<string, string>; flags: Set<string>; error: string | null } {
	const values: Record<string, string> = {};
	const flags = new Set<string>();
	for (let i = 0; i < rest.length; i += 1) {
		const arg = rest[i];
		if (booleans.includes(arg)) {
			flags.add(arg);
			continue;
		}
		const [name, inline] =
			arg.startsWith('--') && arg.includes('=')
				? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
				: [arg, undefined];
		if (!names.includes(name)) return { values, flags, error: `Unknown option "${arg}".` };
		const value = inline ?? rest[i + 1];
		if (value === undefined || value.startsWith('-')) {
			return { values, flags, error: `Option "${name}" needs a value.` };
		}
		if (inline === undefined) i += 1;
		values[name] = value;
	}
	return { values, flags, error: null };
}

export async function run(
	argv: string[],
	io: CliOutput = consoleOutput,
	gh?: GhInvoker
): Promise<number> {
	const [command, ...rest] = argv;

	if (command === undefined || command === '--help' || command === '-h') {
		io.out(USAGE);
		return 0;
	}

	if (command !== 'assert-clean-pages' && command !== 'doctor') {
		io.err(`Unknown command "${command}".`);
		io.err(USAGE);
		return 2;
	}

	if (rest.includes('--help') || rest.includes('-h')) {
		io.out(USAGE);
		return 0;
	}

	if (command === 'doctor') {
		const { values, flags, error } = parseFlags(
			rest,
			['--origin', '--repo', '--app-slug', '--branch'],
			['--no-pages']
		);
		if (error !== null) {
			io.err(error);
			io.err(USAGE);
			return 2;
		}
		const origin = values['--origin'];
		if (origin === undefined) {
			io.err('doctor needs --origin <https://host>.');
			io.err(USAGE);
			return 2;
		}
		return doctor(
			{
				origin,
				repo: values['--repo'],
				appSlug: values['--app-slug'],
				branch: values['--branch'],
				pages: !flags.has('--no-pages')
			},
			io,
			gh
		);
	}

	const localOnly = rest.includes('--local-only');
	const positional = rest.filter((arg) => !arg.startsWith('-'));
	const unknownFlag = rest.find((arg) => arg.startsWith('-') && arg !== '--local-only');
	if (unknownFlag !== undefined) {
		io.err(`Unknown option "${unknownFlag}".`);
		io.err(USAGE);
		return 2;
	}

	return assertCleanPages(positional[0] ?? 'build', { localOnly }, io);
}
