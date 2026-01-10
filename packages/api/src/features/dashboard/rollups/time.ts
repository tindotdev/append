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
 */
export function parseDayKeyToTzRange(dayKey: string, timezone: string): { startMs: number; endMs: number } {
	const [y, m, d] = dayKey.split('-').map((n) => Number(n));
	// Create a date at noon in the target timezone to get the offset
	const noonDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
	const tzFormatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' });
	const parts = tzFormatter.formatToParts(noonDate);
	const offsetPart = parts.find((p) => p.type === 'timeZoneName');

	// Parse offset like "GMT+07:00" or "GMT-05:00" or "GMT"
	let offsetMs = 0;
	if (offsetPart?.value) {
		const match = offsetPart.value.match(/GMT([+-])(\d{2}):(\d{2})/);
		if (match) {
			const sign = match[1] === '+' ? 1 : -1;
			const hours = Number(match[2]);
			const minutes = Number(match[3]);
			offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;
		}
	}

	// Start of day in the timezone = midnight in timezone = midnight UTC - offset
	const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetMs;
	const endMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offsetMs;
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
