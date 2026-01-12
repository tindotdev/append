/**
 * Timezone and day-key helpers (ported from web/src/features/dashboard/telemetry/time.ts).
 */

/**
 * Format a timestamp as YYYY-MM-DD in the given timezone.
 */
export function formatDayKey(ms: number, timezone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date(ms));
}

/**
 * Add/subtract days from a day key (YYYY-MM-DD).
 */
export function addDays(dayKey: string, days: number): string {
	const [y, m, d] = dayKey.split('-').map((n) => Number(n));
	const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
	const y2 = date.getUTCFullYear();
	const m2 = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d2 = String(date.getUTCDate()).padStart(2, '0');
	return `${y2}-${m2}-${d2}`;
}

/**
 * Get today's day key in the given timezone.
 */
export function getTodayKey(timezone: string, nowMs = Date.now()): string {
	return formatDayKey(nowMs, timezone);
}

/**
 * Get short weekday label (Mon, Tue, etc.) for a day key.
 */
export function weekdayLabel(dayKey: string, timezone: string): string {
	const [y, m, d] = dayKey.split('-').map((n) => Number(n));
	const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
	return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
}

/**
 * Number of days in a year (accounts for leap years).
 */
export function daysInYear(year: number): number {
	const start = Date.UTC(year, 0, 1);
	const end = Date.UTC(year + 1, 0, 1);
	return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

/**
 * Parse a day key (YYYY-MM-DD) into start/end timestamps in UTC.
 * Used for export where from/to are interpreted as UTC dates.
 */
export function parseDayKeyToUtcRange(dayKey: string): { startMs: number; endMs: number } {
	const [y, m, d] = dayKey.split('-').map((n) => Number(n));
	const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
	const endMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
	return { startMs, endMs };
}

/**
 * Parse a day key (YYYY-MM-DD) into start/end timestamps in a given timezone.
 * Used for dashboard queries where the user's timezone matters.
 *
 * This properly handles DST transitions by using Intl.DateTimeFormat to convert
 * local date components to UTC timestamps.
 */
export function parseDayKeyToTzRange(dayKey: string, timezone: string): { startMs: number; endMs: number } {
	const [y, m, d] = dayKey.split('-').map((n) => Number(n));

	// Helper to convert local date components (at midnight) in the given timezone to UTC milliseconds.
	// We use an iterative approach: start with a guess (the UTC date), then format it in the target
	// timezone to see what local time it represents, and adjust until we converge.
	const getUtcMsForLocalMidnight = (year: number, month: number, day: number): number => {
		// Start with initial guess: if local date is Y-M-D, assume UTC Y-M-D midnight
		const guessUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

		// Format this UTC timestamp in the target timezone to see what local date/time it represents
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		});

		const parts = formatter.formatToParts(new Date(guessUtc));
		const formatted = {
			year: Number(parts.find((p) => p.type === 'year')?.value),
			month: Number(parts.find((p) => p.type === 'month')?.value),
			day: Number(parts.find((p) => p.type === 'day')?.value),
			hour: Number(parts.find((p) => p.type === 'hour')?.value),
			minute: Number(parts.find((p) => p.type === 'minute')?.value),
			second: Number(parts.find((p) => p.type === 'second')?.value),
		};

		// Compute the difference between what we want (Y-M-D 00:00:00) and what we got
		const wantedUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
		const gotUtc = Date.UTC(formatted.year, formatted.month - 1, formatted.day, formatted.hour, formatted.minute, formatted.second, 0);
		const offsetMs = wantedUtc - gotUtc;

		// Adjust our guess by the offset to get the correct UTC timestamp for local midnight
		return guessUtc + offsetMs;
	};

	const startMs = getUtcMsForLocalMidnight(y, m, d);

	// End time is midnight of the next day minus 1 millisecond
	// First, find the next day's date
	const nextDayDate = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0)); // Use noon to avoid edge cases
	const nextY = nextDayDate.getUTCFullYear();
	const nextM = nextDayDate.getUTCMonth() + 1;
	const nextD = nextDayDate.getUTCDate();

	const nextDayStartMs = getUtcMsForLocalMidnight(nextY, nextM, nextD);
	const endMs = nextDayStartMs - 1;

	return { startMs, endMs };
}

/**
 * Get the year boundaries (start/end timestamps) in a given timezone.
 */
export function getYearBoundariesInTz(year: number, timezone: string): { startMs: number; endMs: number } {
	const startDayKey = `${year}-01-01`;
	const endDayKey = `${year}-12-31`;
	const { startMs } = parseDayKeyToTzRange(startDayKey, timezone);
	const { endMs } = parseDayKeyToTzRange(endDayKey, timezone);
	return { startMs, endMs };
}

/**
 * Validate that a string is a valid IANA timezone.
 * Uses Intl.DateTimeFormat to check.
 */
export function isValidTimezone(tz: string): boolean {
	try {
		Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/**
 * Validate that a string is a valid day key (YYYY-MM-DD).
 */
export function isValidDayKey(dayKey: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return false;
	const [y, m, d] = dayKey.split('-').map((n) => Number(n));
	const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Validate that a number is a valid year (reasonable range).
 */
export function isValidYear(year: number): boolean {
	return Number.isInteger(year) && year >= 1970 && year <= 2100;
}
