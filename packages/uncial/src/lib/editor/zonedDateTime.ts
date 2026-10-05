function offsetMinutes(instant: number, timeZone?: string): number {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		})
			.formatToParts(instant)
			.map(({ type, value }) => [type, Number(value)])
	);
	const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
	return Math.round((wall - Math.floor(instant / 1000) * 1000) / 60_000);
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/** The wall-clock `YYYY-MM-DDTHH:mm` of an ISO instant in `timeZone`, or '' if it is not one. */
export function toWallClock(iso: string, timeZone?: string): string {
	const instant = Date.parse(iso);
	if (!iso || Number.isNaN(instant)) return '';
	return new Date(instant + offsetMinutes(instant, timeZone) * 60_000).toISOString().slice(0, 16);
}

/** The ISO instant, with `timeZone`'s offset, of a `YYYY-MM-DDTHH:mm` wall clock there. */
export function fromWallClock(wallClock: string, timeZone?: string): string {
	const wall = Date.parse(`${wallClock}Z`);
	if (!wallClock || Number.isNaN(wall)) return '';
	let instant = wall - offsetMinutes(wall, timeZone) * 60_000;
	instant = wall - offsetMinutes(instant, timeZone) * 60_000;
	const offset = offsetMinutes(instant, timeZone);
	const sign = offset < 0 ? '-' : '+';
	const zone = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
	return `${toWallClock(new Date(instant).toISOString(), timeZone)}:00${zone}`;
}
