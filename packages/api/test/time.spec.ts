import { describe, expect, it } from 'vitest';
import {
	addDays,
	daysInYear,
	formatDayKey,
	getTodayKey,
	getYearBoundariesInTz,
	isValidDayKey,
	isValidTimezone,
	isValidYear,
	parseDayKeyToTzRange,
	parseDayKeyToUtcRange,
	weekdayLabel,
} from '../src/features/dashboard/rollups/time';

describe('time utilities', () => {
	describe('formatDayKey', () => {
		it('formats a timestamp as YYYY-MM-DD in UTC', () => {
			const ms = Date.UTC(2026, 0, 15, 12, 0, 0); // Jan 15, 2026 noon UTC
			expect(formatDayKey(ms, 'UTC')).toBe('2026-01-15');
		});

		it('formats a timestamp in a different timezone', () => {
			const ms = Date.UTC(2026, 0, 15, 23, 0, 0); // Jan 15, 2026 11pm UTC
			// In America/Los_Angeles (UTC-8), this is still Jan 15 at 3pm
			expect(formatDayKey(ms, 'America/Los_Angeles')).toBe('2026-01-15');
		});
	});

	describe('addDays', () => {
		it('adds days to a day key', () => {
			expect(addDays('2026-01-15', 5)).toBe('2026-01-20');
		});

		it('subtracts days from a day key', () => {
			expect(addDays('2026-01-15', -5)).toBe('2026-01-10');
		});

		it('handles month boundaries', () => {
			expect(addDays('2026-01-30', 5)).toBe('2026-02-04');
		});

		it('handles year boundaries', () => {
			expect(addDays('2025-12-30', 5)).toBe('2026-01-04');
		});
	});

	describe('getTodayKey', () => {
		it('returns today in the given timezone', () => {
			const nowMs = Date.UTC(2026, 0, 15, 12, 0, 0);
			expect(getTodayKey('UTC', nowMs)).toBe('2026-01-15');
		});
	});

	describe('weekdayLabel', () => {
		it('returns short weekday label', () => {
			// 2026-01-15 is a Thursday
			expect(weekdayLabel('2026-01-15', 'UTC')).toBe('Thu');
		});
	});

	describe('daysInYear', () => {
		it('returns 365 for non-leap years', () => {
			expect(daysInYear(2026)).toBe(365);
		});

		it('returns 366 for leap years', () => {
			expect(daysInYear(2024)).toBe(366);
		});
	});

	describe('parseDayKeyToUtcRange', () => {
		it('parses a day key to UTC range', () => {
			const { startMs, endMs } = parseDayKeyToUtcRange('2026-01-15');
			expect(new Date(startMs).toISOString()).toBe('2026-01-15T00:00:00.000Z');
			expect(new Date(endMs).toISOString()).toBe('2026-01-15T23:59:59.999Z');
		});
	});

	describe('parseDayKeyToTzRange', () => {
		it('parses a day key to timezone range in UTC', () => {
			const { startMs, endMs } = parseDayKeyToTzRange('2026-01-15', 'UTC');
			expect(new Date(startMs).toISOString()).toBe('2026-01-15T00:00:00.000Z');
			expect(new Date(endMs).toISOString()).toBe('2026-01-15T23:59:59.999Z');
		});

		it('parses a day key to timezone range in America/Los_Angeles', () => {
			const { startMs, endMs } = parseDayKeyToTzRange('2026-01-15', 'America/Los_Angeles');
			// Jan 15, 2026 midnight PST (UTC-8) = Jan 15 08:00 UTC
			expect(new Date(startMs).toISOString()).toBe('2026-01-15T08:00:00.000Z');
			// Jan 15, 2026 23:59:59.999 PST = Jan 16 07:59:59.999 UTC
			expect(new Date(endMs).toISOString()).toBe('2026-01-16T07:59:59.999Z');
		});
	});

	describe('getYearBoundariesInTz', () => {
		it('gets year boundaries in UTC', () => {
			const { startMs, endMs } = getYearBoundariesInTz(2026, 'UTC');
			expect(new Date(startMs).toISOString()).toBe('2026-01-01T00:00:00.000Z');
			expect(new Date(endMs).toISOString()).toBe('2026-12-31T23:59:59.999Z');
		});
	});

	describe('isValidTimezone', () => {
		it('validates valid timezones', () => {
			expect(isValidTimezone('UTC')).toBe(true);
			expect(isValidTimezone('America/New_York')).toBe(true);
			expect(isValidTimezone('Europe/London')).toBe(true);
		});

		it('rejects invalid timezones', () => {
			expect(isValidTimezone('Invalid/Timezone')).toBe(false);
			expect(isValidTimezone('America/Invalid')).toBe(false);
		});
	});

	describe('isValidDayKey', () => {
		it('validates valid day keys', () => {
			expect(isValidDayKey('2026-01-15')).toBe(true);
			expect(isValidDayKey('2026-12-31')).toBe(true);
		});

		it('rejects invalid day keys', () => {
			expect(isValidDayKey('2026-13-01')).toBe(false); // Invalid month
			expect(isValidDayKey('2026-01-32')).toBe(false); // Invalid day
			expect(isValidDayKey('not-a-date')).toBe(false);
			expect(isValidDayKey('2026-1-1')).toBe(false); // Wrong format
		});
	});

	describe('isValidYear', () => {
		it('validates valid years', () => {
			expect(isValidYear(2026)).toBe(true);
			expect(isValidYear(1970)).toBe(true);
			expect(isValidYear(2100)).toBe(true);
		});

		it('rejects invalid years', () => {
			expect(isValidYear(1969)).toBe(false);
			expect(isValidYear(2101)).toBe(false);
			expect(isValidYear(2026.5)).toBe(false);
		});
	});

	describe('DST transitions', () => {
		describe('Spring forward - 2026-03-08 US timezone transition', () => {
			it('handles day before DST transition', () => {
				// March 7, 2026 in America/New_York (EST, UTC-5)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-03-07', 'America/New_York');
				// Midnight EST = 05:00 UTC
				expect(new Date(startMs).toISOString()).toBe('2026-03-07T05:00:00.000Z');
				// 23:59:59.999 EST = next day 04:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-03-08T04:59:59.999Z');
			});

			it('handles DST transition day (spring forward)', () => {
				// March 8, 2026 in America/New_York (EDT starts at 2am, clocks jump to 3am)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-03-08', 'America/New_York');
				// Midnight EST (UTC-5) = 05:00 UTC (day starts before transition)
				expect(new Date(startMs).toISOString()).toBe('2026-03-08T05:00:00.000Z');
				// 23:59:59.999 EDT (UTC-4) = next day 03:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-03-09T03:59:59.999Z');
			});

			it('handles day after DST transition', () => {
				// March 9, 2026 in America/New_York (EDT, UTC-4)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-03-09', 'America/New_York');
				// Midnight EDT = 04:00 UTC
				expect(new Date(startMs).toISOString()).toBe('2026-03-09T04:00:00.000Z');
				// 23:59:59.999 EDT = next day 03:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-03-10T03:59:59.999Z');
			});

			it('formats timestamps around spring forward correctly', () => {
				// Just before 2am EST on March 8 (before transition)
				const beforeMs = Date.UTC(2026, 2, 8, 6, 59, 0); // 1:59am EST
				expect(formatDayKey(beforeMs, 'America/New_York')).toBe('2026-03-08');

				// Just after 3am EDT on March 8 (after transition)
				const afterMs = Date.UTC(2026, 2, 8, 7, 1, 0); // 3:01am EDT
				expect(formatDayKey(afterMs, 'America/New_York')).toBe('2026-03-08');
			});

			it('handles Pacific timezone spring forward (2026-03-08)', () => {
				// March 8, 2026 in America/Los_Angeles (PDT starts at 2am)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-03-08', 'America/Los_Angeles');
				// Midnight PST (UTC-8) = 08:00 UTC
				expect(new Date(startMs).toISOString()).toBe('2026-03-08T08:00:00.000Z');
				// 23:59:59.999 PDT (UTC-7) = next day 06:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-03-09T06:59:59.999Z');
			});
		});

		describe('Fall back - 2026-11-01 US timezone transition', () => {
			it('handles day before DST transition', () => {
				// October 31, 2026 in America/New_York (EDT, UTC-4)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-10-31', 'America/New_York');
				// Midnight EDT = 04:00 UTC
				expect(new Date(startMs).toISOString()).toBe('2026-10-31T04:00:00.000Z');
				// 23:59:59.999 EDT = next day 03:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-11-01T03:59:59.999Z');
			});

			it('handles DST transition day (fall back)', () => {
				// November 1, 2026 in America/New_York (EST returns at 2am, clocks fall back to 1am)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-11-01', 'America/New_York');
				// Midnight EDT (UTC-4) = 04:00 UTC
				expect(new Date(startMs).toISOString()).toBe('2026-11-01T04:00:00.000Z');
				// 23:59:59.999 EST (UTC-5) = next day 04:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-11-02T04:59:59.999Z');
			});

			it('handles day after DST transition', () => {
				// November 2, 2026 in America/New_York (EST, UTC-5)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-11-02', 'America/New_York');
				// Midnight EST = 05:00 UTC
				expect(new Date(startMs).toISOString()).toBe('2026-11-02T05:00:00.000Z');
				// 23:59:59.999 EST = next day 04:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-11-03T04:59:59.999Z');
			});

			it('formats timestamps around fall back correctly', () => {
				// First 1:30am EDT (before transition)
				const before1Ms = Date.UTC(2026, 10, 1, 5, 30, 0); // 1:30am EDT
				expect(formatDayKey(before1Ms, 'America/New_York')).toBe('2026-11-01');

				// Second 1:30am EST (after clocks fall back)
				const after1Ms = Date.UTC(2026, 10, 1, 6, 30, 0); // 1:30am EST
				expect(formatDayKey(after1Ms, 'America/New_York')).toBe('2026-11-01');
			});

			it('handles Pacific timezone fall back (2026-11-01)', () => {
				// November 1, 2026 in America/Los_Angeles (PST returns at 2am)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-11-01', 'America/Los_Angeles');
				// Midnight PDT (UTC-7) = 07:00 UTC
				expect(new Date(startMs).toISOString()).toBe('2026-11-01T07:00:00.000Z');
				// 23:59:59.999 PST (UTC-8) = next day 07:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-11-02T07:59:59.999Z');
			});
		});

		describe('Edge cases around transition hours', () => {
			it('handles timestamps in the skipped hour (spring forward)', () => {
				// During spring forward, 2am-3am doesn't exist in local time
				// A timestamp in this range should still format to the correct date
				const skippedHourMs = Date.UTC(2026, 2, 8, 7, 30, 0); // Would be 2:30am if it existed
				expect(formatDayKey(skippedHourMs, 'America/New_York')).toBe('2026-03-08');
			});

			it('handles timestamps in the repeated hour (fall back)', () => {
				// During fall back, 1am-2am happens twice
				// Both instances should format to the same date
				const firstTimeMs = Date.UTC(2026, 10, 1, 5, 30, 0); // First 1:30am (EDT)
				const secondTimeMs = Date.UTC(2026, 10, 1, 6, 30, 0); // Second 1:30am (EST)
				expect(formatDayKey(firstTimeMs, 'America/New_York')).toBe('2026-11-01');
				expect(formatDayKey(secondTimeMs, 'America/New_York')).toBe('2026-11-01');
			});

			it('handles exact transition moment (spring forward)', () => {
				// Exactly 2am EST = 7am UTC (the moment clocks jump to 3am EDT)
				const transitionMs = Date.UTC(2026, 2, 8, 7, 0, 0);
				expect(formatDayKey(transitionMs, 'America/New_York')).toBe('2026-03-08');
			});

			it('handles exact transition moment (fall back)', () => {
				// Exactly 2am EDT = 6am UTC (the moment clocks fall back to 1am EST)
				const transitionMs = Date.UTC(2026, 10, 1, 6, 0, 0);
				expect(formatDayKey(transitionMs, 'America/New_York')).toBe('2026-11-01');
			});

			it('handles year boundaries with year-end DST (southern hemisphere)', () => {
				// Australia/Sydney: DST starts first Sunday in October, ends first Sunday in April
				// Test around New Year when Sydney is in DST (UTC+11)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-01-01', 'Australia/Sydney');
				// Midnight AEDT (UTC+11) = previous day 13:00 UTC
				expect(new Date(startMs).toISOString()).toBe('2025-12-31T13:00:00.000Z');
				// 23:59:59.999 AEDT = same day 12:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-01-01T12:59:59.999Z');
			});

			it('validates day keys remain consistent across DST', () => {
				// formatDayKey should produce valid day keys that can be parsed back
				const springForwardMs = Date.UTC(2026, 2, 8, 12, 0, 0);
				const fallBackMs = Date.UTC(2026, 10, 1, 12, 0, 0);

				const springKey = formatDayKey(springForwardMs, 'America/New_York');
				const fallKey = formatDayKey(fallBackMs, 'America/New_York');

				expect(isValidDayKey(springKey)).toBe(true);
				expect(isValidDayKey(fallKey)).toBe(true);
			});
		});

		describe('Fractional DST offset zones (Australia/Lord_Howe)', () => {
			// Australia/Lord_Howe uses UTC+10:30 in winter and UTC+11 in summer (DST).
			// The DST transition is only ±30 minutes, which can require iterative convergence.

			it('handles Lord_Howe standard time (winter)', () => {
				// July 15, 2026 in Australia/Lord_Howe (LHST, UTC+10:30)
				// Midnight LHST = previous day 13:30 UTC
				const { startMs, endMs } = parseDayKeyToTzRange('2026-07-15', 'Australia/Lord_Howe');
				expect(new Date(startMs).toISOString()).toBe('2026-07-14T13:30:00.000Z');
				// 23:59:59.999 LHST = same day 13:29:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-07-15T13:29:59.999Z');
			});

			it('handles Lord_Howe daylight saving time (summer)', () => {
				// January 15, 2026 in Australia/Lord_Howe (LHDT, UTC+11)
				// Midnight LHDT = previous day 13:00 UTC
				const { startMs, endMs } = parseDayKeyToTzRange('2026-01-15', 'Australia/Lord_Howe');
				expect(new Date(startMs).toISOString()).toBe('2026-01-14T13:00:00.000Z');
				// 23:59:59.999 LHDT = same day 12:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-01-15T12:59:59.999Z');
			});

			it('handles Lord_Howe DST transition day (spring forward, first Sunday in October)', () => {
				// In 2026, DST starts first Sunday in October = October 4
				// At 2:00am LHST (UTC+10:30), clocks move forward to 2:30am LHDT (UTC+11)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-10-04', 'Australia/Lord_Howe');
				// Day starts at midnight LHST (UTC+10:30) = Oct 3 13:30 UTC
				expect(new Date(startMs).toISOString()).toBe('2026-10-03T13:30:00.000Z');
				// Day ends at 23:59:59.999 LHDT (UTC+11) = Oct 4 12:59:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-10-04T12:59:59.999Z');
			});

			it('handles Lord_Howe DST transition day (fall back, first Sunday in April)', () => {
				// In 2026, DST ends first Sunday in April = April 5
				// At 2:00am LHDT (UTC+11), clocks move back to 1:30am LHST (UTC+10:30)
				const { startMs, endMs } = parseDayKeyToTzRange('2026-04-05', 'Australia/Lord_Howe');
				// Day starts at midnight LHDT (UTC+11) = Apr 4 13:00 UTC
				expect(new Date(startMs).toISOString()).toBe('2026-04-04T13:00:00.000Z');
				// Day ends at 23:59:59.999 LHST (UTC+10:30) = Apr 5 13:29:59.999 UTC
				expect(new Date(endMs).toISOString()).toBe('2026-04-05T13:29:59.999Z');
			});
		});
	});
});
