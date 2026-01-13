/**
 * Dashboard routes: read models for learning telemetry.
 *
 * GET /api/dashboard/today - Today's stats, streak, breakdown, captures
 * GET /api/dashboard/week - 7-day series and breakdown
 * GET /api/dashboard/heatmap - Full year heatmap
 */

import { Hono } from 'hono';
import * as v from 'valibot';
import type { Bindings, Variables } from '../../platform/bindings';
import { apiError } from '../../shared/api-error';
import { getDashboardHeatmap } from './usecases/getDashboardHeatmap';
import { getDashboardToday } from './usecases/getDashboardToday';
import { getDashboardWeek } from './usecases/getDashboardWeek';
import { DashboardHeatmapQuerySchema, DashboardTodayQuerySchema, DashboardWeekQuerySchema } from './validation/dashboard.schema';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function firstIssueMessage(issues: v.BaseIssue<unknown>[] | undefined): string {
	return issues?.[0]?.message ?? 'Validation failed';
}

/**
 * GET /today - Today's dashboard data
 */
export const dashboardRoutes = app
	.get('/today', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');

		const query = c.req.query();
		const parsed = v.safeParse(DashboardTodayQuerySchema, query);

		if (!parsed.success) {
			return apiError(c, 400, 'VALIDATION_ERROR', firstIssueMessage(parsed.issues));
		}

		const { tz } = parsed.output;

		const result = await getDashboardToday(db, userId, tz);

		if (!result.ok) {
			return apiError(
				c,
				413,
				'RANGE_TOO_LARGE',
				'Too many events to process. Please narrow the date range or wait for materialized rollups.',
				{ max_events_scanned: 250_000 }
			);
		}

		return c.json(result.data);
	})
	/**
	 * GET /week - Weekly bar chart + breakdown
	 */
	.get('/week', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');

		const query = c.req.query();
		const parsed = v.safeParse(DashboardWeekQuerySchema, query);

		if (!parsed.success) {
			return apiError(c, 400, 'VALIDATION_ERROR', firstIssueMessage(parsed.issues));
		}

		const { start, tz } = parsed.output;

		const result = await getDashboardWeek(db, userId, start, tz);

		if (!result.ok) {
			return apiError(
				c,
				413,
				'RANGE_TOO_LARGE',
				'Too many events to process. Please narrow the date range or wait for materialized rollups.',
				{ max_events_scanned: 250_000 }
			);
		}

		return c.json(result.data);
	})
	/**
	 * GET /heatmap - Full year heatmap
	 */
	.get('/heatmap', async (c) => {
		const userId = c.get('userId');
		const db = c.get('db');

		const query = c.req.query();
		const parsed = v.safeParse(DashboardHeatmapQuerySchema, query);

		if (!parsed.success) {
			return apiError(c, 400, 'VALIDATION_ERROR', firstIssueMessage(parsed.issues));
		}

		const { year, tz } = parsed.output;

		const result = await getDashboardHeatmap(db, userId, year, tz);

		if (!result.ok) {
			return apiError(
				c,
				413,
				'RANGE_TOO_LARGE',
				'Too many events to process. Please narrow the date range or wait for materialized rollups.',
				{ max_events_scanned: 250_000 }
			);
		}

		return c.json(result.data);
	});
