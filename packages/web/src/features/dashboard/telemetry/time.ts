export function getBrowserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function formatDayKey(ms: number, timezone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date(ms));
}

export function addDays(dayKey: string, days: number): string {
	const [y, m, d] = dayKey.split('-').map((n) => Number(n));
	const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
	const y2 = date.getUTCFullYear();
	const m2 = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d2 = String(date.getUTCDate()).padStart(2, '0');
	return `${y2}-${m2}-${d2}`;
}

export function getTodayKey(timezone: string, nowMs = Date.now()): string {
	return formatDayKey(nowMs, timezone);
}

export function weekdayLabel(dayKey: string, timezone: string): string {
	const [y, m, d] = dayKey.split('-').map((n) => Number(n));
	const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
	return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
}

export function daysInYear(year: number): number {
	const start = Date.UTC(year, 0, 1);
	const end = Date.UTC(year + 1, 0, 1);
	return Math.round((end - start) / (24 * 60 * 60 * 1000));
}
