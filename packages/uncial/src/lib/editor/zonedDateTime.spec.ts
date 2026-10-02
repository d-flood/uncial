import { describe, expect, it } from 'vitest';
import { fromWallClock, toWallClock } from './zonedDateTime.js';

describe('zoned date-times', () => {
	it('writes a wall clock with the zone’s offset on that date', () => {
		expect(fromWallClock('2026-01-15T19:00', 'America/Chicago')).toBe('2026-01-15T19:00:00-06:00');
		expect(fromWallClock('2026-07-15T19:00', 'America/Chicago')).toBe('2026-07-15T19:00:00-05:00');
		expect(fromWallClock('2026-07-15T19:00', 'Asia/Kolkata')).toBe('2026-07-15T19:00:00+05:30');
		expect(fromWallClock('', 'America/Chicago')).toBe('');
	});

	it('reads any ISO instant as a wall clock in the zone', () => {
		expect(toWallClock('2026-07-16T00:00:00Z', 'America/Chicago')).toBe('2026-07-15T19:00');
		expect(toWallClock('2026-01-15T19:00:00-06:00', 'America/Chicago')).toBe('2026-01-15T19:00');
		expect(toWallClock('not a date', 'America/Chicago')).toBe('');
	});
});
