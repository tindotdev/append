import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWeekBarChartData } from '../use-dashboard-data';

vi.mock('../../api/dashboard', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../api/dashboard')>();
	return {
		...actual,
		shouldUseApi: vi.fn(() => true),
		useDashboardToday: vi.fn(),
		useDashboardWeek: vi.fn(),
	};
});

vi.mock('../../telemetry/hooks', () => {
	return {
		useTelemetrySnapshot: vi.fn(() => ({
			isReady: false,
			events: [],
			timezone: 'UTC',
			revision: 1,
		})),
	};
});

describe('useWeekBarChartData', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('uses the week API hook (not today) when API mode is enabled', async () => {
		const dashboardApi = await import('../../api/dashboard');
		const mockUseDashboardWeek = vi.mocked(dashboardApi.useDashboardWeek);
		const mockUseDashboardToday = vi.mocked(dashboardApi.useDashboardToday);

		mockUseDashboardWeek.mockReturnValue({
			data: {
				week: {
					days: [
						{ date: '2026-01-04', dayLabel: 'Sun', minutes: 10 },
						{ date: '2026-01-05', dayLabel: 'Mon', minutes: 20 },
						{ date: '2026-01-06', dayLabel: 'Tue', minutes: 0 },
						{ date: '2026-01-07', dayLabel: 'Wed', minutes: 5 },
						{ date: '2026-01-08', dayLabel: 'Thu', minutes: 15 },
						{ date: '2026-01-09', dayLabel: 'Fri', minutes: 0 },
						{ date: '2026-01-10', dayLabel: 'Sat', minutes: 30 },
					],
				},
				weekBreakdown: { topics: [], sources: [] },
			},
			isLoading: false,
		} as any);

		function Test() {
			const { data, isLoading, isEmpty } = useWeekBarChartData();
			return <div data-testid="out">{JSON.stringify({ data, isLoading, isEmpty })}</div>;
		}

		const container = document.createElement('div');
		const root = createRoot(container);

		await act(async () => {
			root.render(<Test />);
		});

		expect(mockUseDashboardWeek).toHaveBeenCalledWith('2026-01-04', 'UTC');
		expect(mockUseDashboardToday).not.toHaveBeenCalled();

		const out = container.querySelector('[data-testid="out"]')?.textContent;
		expect(out).toContain('"isLoading":false');
		expect(out).toContain('"isEmpty":false');
		expect(out).toContain('"date":"2026-01-10"');

		await act(async () => {
			root.unmount();
		});
	});
});
