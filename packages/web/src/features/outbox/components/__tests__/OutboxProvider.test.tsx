import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/features/auth/hooks/use-auth';
import { createAppOutbox, createLeadershipProvider, generateTabId } from '@/lib/outbox-adapter';
import { OutboxProvider } from '../OutboxProvider';

vi.mock('@/lib/outbox-adapter', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/outbox-adapter')>();
	return {
		...actual,
		createAppOutbox: vi.fn(),
		createLeadershipProvider: vi.fn(),
		deleteOutboxDatabase: vi.fn(),
		generateTabId: vi.fn(),
	};
});

describe('OutboxProvider', () => {
	const mockCreateOutbox = vi.mocked(createAppOutbox);
	const mockCreateLeadershipProvider = vi.mocked(createLeadershipProvider);
	const mockGenerateTabId = vi.mocked(generateTabId);

	beforeEach(() => {
		vi.resetAllMocks();
		sessionStorage.clear();
	});

	it('resumes auth-blocked items when auth session changes for the same user', async () => {
		const resumeBlockedAuth = vi.fn().mockResolvedValue(1);
		const countByStatus = vi.fn().mockResolvedValue({ pending: 0, failed: 0, blocked_auth: 0 });
		const publish = vi.fn();

		mockCreateOutbox.mockReturnValue({
			store: {
				put: vi.fn(),
				get: vi.fn(),
				listDue: vi.fn().mockResolvedValue([]),
				resumeBlockedAuth,
				countByStatus,
				listByStatus: vi.fn(),
				delete: vi.fn(),
				deleteIf: vi.fn().mockResolvedValue(false),
				close: vi.fn(),
			},
			broadcast: {
				subscribe: vi.fn(() => () => {}),
				publish,
			},
			senderLoop: {
				processOnce: vi.fn().mockResolvedValue(false),
				getNextDueTime: vi.fn().mockResolvedValue(null),
			},
			enqueue: vi.fn(),
			undo: vi.fn(),
		});

		mockCreateLeadershipProvider.mockReturnValue({
			type: 'lease',
			isAvailable: () => true,
			tryAcquire: vi.fn().mockResolvedValue(null),
		});

		mockGenerateTabId.mockReturnValue('tab-1');

		const container = document.createElement('div');
		const root = createRoot(container);

		const session1 = { user: { id: 'user-1' }, session: { id: 'session-1', expiresAt: 1000 } };
		const session2 = { user: { id: 'user-1' }, session: { id: 'session-2', expiresAt: 2000 } };

		await act(async () => {
			root.render(
				<AuthContext.Provider value={{ data: session1 } as any}>
					<OutboxProvider>
						<div />
					</OutboxProvider>
				</AuthContext.Provider>
			);
		});

		await vi.waitFor(() => {
			expect(resumeBlockedAuth).toHaveBeenCalledTimes(1);
		});

		await act(async () => {
			root.render(
				<AuthContext.Provider value={{ data: session2 } as any}>
					<OutboxProvider>
						<div />
					</OutboxProvider>
				</AuthContext.Provider>
			);
		});

		await vi.waitFor(() => {
			expect(resumeBlockedAuth).toHaveBeenCalledTimes(2);
		});

		await act(async () => {
			root.unmount();
		});
	});
});
