/**
 * Validation schemas for dashboard query parameters.
 */

import * as v from 'valibot';
import { isValidDayKey, isValidTimezone, isValidYear } from '../rollups/time';

/**
 * Custom timezone validation.
 */
const TimezoneSchema = v.pipe(
	v.string(),
	v.check((tz) => isValidTimezone(tz), 'Invalid timezone. Must be a valid IANA timezone (e.g., "America/New_York").')
);

/**
 * Custom day key validation (YYYY-MM-DD).
 */
const DayKeySchema = v.pipe(
	v.string(),
	v.check((dk) => isValidDayKey(dk), 'Invalid date format. Must be YYYY-MM-DD.')
);

/**
 * Custom year validation (1970-2100).
 */
const YearSchema = v.pipe(
	v.number(),
	v.integer('Year must be an integer'),
	v.check((y) => isValidYear(y), 'Year must be between 1970 and 2100.')
);

/**
 * GET /api/dashboard/today?tz=...
 */
export const DashboardTodayQuerySchema = v.object({
	tz: v.optional(TimezoneSchema, 'UTC'),
});

export type DashboardTodayQuery = v.InferOutput<typeof DashboardTodayQuerySchema>;

/**
 * GET /api/dashboard/week?start=YYYY-MM-DD&tz=...
 */
export const DashboardWeekQuerySchema = v.object({
	start: DayKeySchema,
	tz: v.optional(TimezoneSchema, 'UTC'),
});

export type DashboardWeekQuery = v.InferOutput<typeof DashboardWeekQuerySchema>;

/**
 * GET /api/dashboard/heatmap?year=YYYY&tz=...
 */
export const DashboardHeatmapQuerySchema = v.object({
	year: v.pipe(
		v.string(),
		v.transform((s) => Number(s)),
		YearSchema
	),
	tz: v.optional(TimezoneSchema, 'UTC'),
});

export type DashboardHeatmapQuery = v.InferOutput<typeof DashboardHeatmapQuerySchema>;
