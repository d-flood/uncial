/**
 * Post-save deploy-status lifecycle (ticket 05, SPEC §6.6 / D5).
 *
 * After a save commits, the runtime polls `adapter.commitStatus(commitSha)` and
 * surfaces the deploy lifecycle: `committed → building… → live` (or
 * `build failed`, or a calm `status unknown` when the repo reports no checks).
 * The timing constants live here; tests shrink them via injection.
 */

export type CommitStatus = 'pending' | 'success' | 'failure' | 'unknown';

export type DeployPhase =
	| 'committed' // commit landed; first poll not yet run
	| 'building' // commitStatus === pending
	| 'live' // commitStatus === success (terminal)
	| 'failed' // commitStatus === failure (terminal)
	| 'unknown' // commitStatus === unknown, e.g. no CI (terminal, calm)
	| 'timeout'; // hard-stopped while still building (terminal, calm)

export interface DeployStatusTimings {
	/** Delay before the first commit-status poll. */
	firstDelayMs: number;
	/** Delay between subsequent polls. */
	intervalMs: number;
	/** Hard stop; after this the phase becomes `timeout` and polling ends. */
	timeoutMs: number;
}

export const DEFAULT_DEPLOY_STATUS_TIMINGS: DeployStatusTimings = {
	firstDelayMs: 3_000,
	intervalMs: 10_000,
	timeoutMs: 5 * 60_000
};

/** Map a forge commit status to a deploy phase and whether polling should stop. */
export function deployPhaseForStatus(status: CommitStatus): { phase: DeployPhase; done: boolean } {
	switch (status) {
		case 'pending':
			return { phase: 'building', done: false };
		case 'success':
			return { phase: 'live', done: true };
		case 'failure':
			return { phase: 'failed', done: true };
		case 'unknown':
		default:
			// No CI configured (or the forge reports nothing): terminal and calm.
			return { phase: 'unknown', done: true };
	}
}

export interface DeployStatusView {
	text: string;
	/** Commit permalink on the forge, offered as a follow-up link. */
	commitUrl: string;
	/** Non-`failed` phases must render calmly, never as errors (D5). */
	tone: 'progress' | 'success' | 'error';
}

export function githubCommitUrl(repo: string, commitSha: string): string {
	return `https://github.com/${repo}/commit/${commitSha}`;
}

/** Human-facing copy for a phase; the branch is always named (ticket contract). */
export function describeDeployPhase(
	phase: DeployPhase,
	ctx: { branch: string; commitSha: string; commitUrl: string }
): DeployStatusView {
	const short = ctx.commitSha.slice(0, 7);
	const base = { commitUrl: ctx.commitUrl } as const;
	switch (phase) {
		case 'committed':
			return { ...base, tone: 'progress', text: `Committed to ${ctx.branch} · checking deploy status…` };
		case 'building':
			return {
				...base,
				tone: 'progress',
				text: `Committed to ${ctx.branch} · building… (usually ~1–2 min)`
			};
		case 'live':
			return { ...base, tone: 'success', text: `Live on ${ctx.branch} · commit ${short}` };
		case 'failed':
			return { ...base, tone: 'error', text: `Build failed on ${ctx.branch} · commit ${short}` };
		case 'unknown':
			return {
				...base,
				tone: 'progress',
				text: `Committed to ${ctx.branch} · commit ${short} (no deploy status reported)`
			};
		case 'timeout':
			return {
				...base,
				tone: 'progress',
				text: `Committed to ${ctx.branch} · status unknown (still building?) · commit ${short}`
			};
	}
}

export type Schedule = (fn: () => void, ms: number) => () => void;

const defaultSchedule: Schedule = (fn, ms) => {
	const id = setTimeout(fn, ms);
	return () => clearTimeout(id);
};

export interface DeployPollHandle {
	cancel(): void;
}

/**
 * Poll `check` until a terminal status or the timeout. Emits `committed`
 * synchronously, then a phase per poll. Stops on any terminal phase, on
 * timeout, or on `cancel()`. Never throws — a failed check retries until the
 * deadline.
 */
export function startDeployPolling(opts: {
	check: () => Promise<CommitStatus>;
	onPhase: (phase: DeployPhase) => void;
	timings?: DeployStatusTimings;
	schedule?: Schedule;
}): DeployPollHandle {
	const timings = opts.timings ?? DEFAULT_DEPLOY_STATUS_TIMINGS;
	const schedule = opts.schedule ?? defaultSchedule;

	let stopped = false;
	let cancelNext: (() => void) | null = null;
	let cancelDeadline: (() => void) | null = null;

	const stop = () => {
		stopped = true;
		cancelNext?.();
		cancelDeadline?.();
		cancelNext = null;
		cancelDeadline = null;
	};

	const emit = (phase: DeployPhase, done: boolean) => {
		if (stopped) return;
		opts.onPhase(phase);
		if (done) stop();
	};

	const poll = async () => {
		if (stopped) return;
		let status: CommitStatus;
		try {
			status = await opts.check();
		} catch {
			// Transient poll failure: keep trying until the deadline fires.
			if (!stopped) cancelNext = schedule(() => void poll(), timings.intervalMs);
			return;
		}
		if (stopped) return;
		const { phase, done } = deployPhaseForStatus(status);
		emit(phase, done);
		if (!stopped) cancelNext = schedule(() => void poll(), timings.intervalMs);
	};

	// The commit landed; announce it before the first poll.
	opts.onPhase('committed');
	cancelDeadline = schedule(() => emit('timeout', true), timings.timeoutMs);
	cancelNext = schedule(() => void poll(), timings.firstDelayMs);

	return { cancel: stop };
}
