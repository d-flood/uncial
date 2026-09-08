/** Argument parsing and dispatch for the `uncial-cms` command. */
import { assertCleanPages } from './assert-clean-pages.js';
import type { CliOutput } from './assert-clean-pages.js';

const USAGE = `uncial-cms — build gates for a site that edits itself

Usage:
  uncial-cms assert-clean-pages [buildDir] [--local-only]

    Assert that Content pages ship no uncial-cms JavaScript and that every
    Editor variant does. buildDir defaults to "build".

    --local-only  Assert a local-only site's production build instead: no
                  Editor variant exists, and no file in the build carries the
                  CMS runtime sentinel or the editor stack.

  uncial-cms --help    Print this message.`;

export const consoleOutput: CliOutput = {
	out: (line) => console.log(line),
	err: (line) => console.error(line)
};

export function run(argv: string[], io: CliOutput = consoleOutput): number {
	const [command, ...rest] = argv;

	if (command === undefined || command === '--help' || command === '-h') {
		io.out(USAGE);
		return 0;
	}

	if (command !== 'assert-clean-pages') {
		io.err(`Unknown command "${command}".`);
		io.err(USAGE);
		return 2;
	}

	if (rest.includes('--help') || rest.includes('-h')) {
		io.out(USAGE);
		return 0;
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
