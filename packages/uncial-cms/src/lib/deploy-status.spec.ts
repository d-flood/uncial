import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_DEPLOY_STATUS_TIMINGS,
	deployPhaseForStatus,
	describeDeployPhase,
	githubCommitUrl,
	startDeployPolling,
	type DeployPhase,
	type DeployStatusTimings
} from './deploy-status.js';

const TIMINGS: DeployStatusTimings = { firstDelayMs: 3_000, intervalMs: 10_000, timeoutMs: 300_000 };

describe('deployPhaseForStatus', () => {
	it('maps forge statuses to phases and terminal-ness', () => {
		expect(deployPhaseForStatus('pending')).toEqual({ phase: 'building', done: false });
		expect(deployPhaseForStatus('success')).toEqual({ phase: 'live', done: true });
		expect(deployPhaseForStatus('failure')).toEqual({ phase: 'failed', done: true });
		expect(deployPhaseForStatus('unknown')).toEqual({ phase: 'unknown', done: true });
	});
});

describe('describeDeployPhase', () => {
	const ctx = {
		branch: 'main',
		commitSha: '1234567deadbeef',
		commitUrl: 'https://github.com/o/r/commit/1234567deadbeef'
	};

	it('always names the branch and keeps unknown/timeout calm', () => {
		expect(describeDeployPhase('building', ctx).text).toContain('main');
		expect(describeDeployPhase('building', ctx).text).toContain('building…');
		expect(describeDeployPhase('live', ctx)).toMatchObject({ tone: 'success' });
		expect(describeDeployPhase('failed', ctx)).toMatchObject({ tone: 'error' });
		// Calm, non-error tone for the no-CI and timeout cases (D5).
		expect(describeDeployPhase('unknown', ctx).tone).toBe('progress');
		expect(describeDeployPhase('timeout', ctx).tone).toBe('progress');
		expect(describeDeployPhase('timeout', ctx).text).toContain('still building?');
		expect(describeDeployPhase('timeout', ctx).commitUrl).toBe(ctx.commitUrl);
	});
});

describe('githubCommitUrl', () => {
	it('builds a commit permalink', () => {
		expect(githubCommitUrl('d-flood/uncial', 'abc123')).toBe(
			'https://github.com/d-flood/uncial/commit/abc123'
		);
	});
});

describe('startDeployPolling', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	function collect(check: () => Promise<'pending' | 'success' | 'failure' | 'unknown'>) {
		const phases: DeployPhase[] = [];
		const handle = startDeployPolling({
			check,
			onPhase: (phase) => phases.push(phase),
			timings: TIMINGS
		});
		return { phases, handle };
	}

	it('goes pending → success: committed → building → live, then stops', async () => {
		const check = vi
			.fn<() => Promise<'pending' | 'success' | 'failure' | 'unknown'>>()
			.mockResolvedValueOnce('pending')
			.mockResolvedValueOnce('success');
		const { phases } = collect(check);

		expect(phases).toEqual(['committed']); // emitted synchronously
		await vi.advanceTimersByTimeAsync(TIMINGS.firstDelayMs);
		expect(phases).toEqual(['committed', 'building']);
		await vi.advanceTimersByTimeAsync(TIMINGS.intervalMs);
		expect(phases).toEqual(['committed', 'building', 'live']);

		// Terminal: no further polling.
		await vi.advanceTimersByTimeAsync(TIMINGS.intervalMs * 5);
		expect(phases).toEqual(['committed', 'building', 'live']);
		expect(check).toHaveBeenCalledTimes(2);
	});

	it('goes pending → failure: committed → building → failed, then stops', async () => {
		const check = vi
			.fn<() => Promise<'pending' | 'success' | 'failure' | 'unknown'>>()
			.mockResolvedValueOnce('pending')
			.mockResolvedValueOnce('failure');
		const { phases } = collect(check);

		await vi.advanceTimersByTimeAsync(TIMINGS.firstDelayMs);
		await vi.advanceTimersByTimeAsync(TIMINGS.intervalMs);
		expect(phases).toEqual(['committed', 'building', 'failed']);
	});

	it('treats a first unknown as a calm terminal (no CI)', async () => {
		const check = vi
			.fn<() => Promise<'pending' | 'success' | 'failure' | 'unknown'>>()
			.mockResolvedValue('unknown');
		const { phases } = collect(check);

		await vi.advanceTimersByTimeAsync(TIMINGS.firstDelayMs);
		expect(phases).toEqual(['committed', 'unknown']);

		await vi.advanceTimersByTimeAsync(TIMINGS.intervalMs * 5);
		expect(phases).toEqual(['committed', 'unknown']);
		expect(check).toHaveBeenCalledTimes(1);
	});

	it('hard-stops at the timeout while still building', async () => {
		const check = vi
			.fn<() => Promise<'pending' | 'success' | 'failure' | 'unknown'>>()
			.mockResolvedValue('pending');
		const { phases } = collect(check);

		await vi.advanceTimersByTimeAsync(TIMINGS.timeoutMs + TIMINGS.intervalMs);
		expect(phases[0]).toBe('committed');
		expect(phases).toContain('building');
		expect(phases.at(-1)).toBe('timeout');
	});

	it('stops emitting after cancel()', async () => {
		const check = vi
			.fn<() => Promise<'pending' | 'success' | 'failure' | 'unknown'>>()
			.mockResolvedValue('pending');
		const { phases, handle } = collect(check);
		handle.cancel();

		await vi.advanceTimersByTimeAsync(TIMINGS.timeoutMs + TIMINGS.intervalMs);
		expect(phases).toEqual(['committed']);
	});

	it('exposes the real product timings as defaults', () => {
		expect(DEFAULT_DEPLOY_STATUS_TIMINGS).toEqual({
			firstDelayMs: 3_000,
			intervalMs: 10_000,
			timeoutMs: 300_000
		});
	});
});
