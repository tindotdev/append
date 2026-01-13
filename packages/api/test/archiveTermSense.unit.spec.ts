/**
 * Unit tests for archiveTermSense use case.
 *
 * These tests verify the partial-write bug fix at the use case level
 * by directly testing the archiveTermSense function with controlled DB state.
 */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { describe, expect, it, vi } from 'vitest';
import type { schema } from '../src/db';
import { archiveTermSense } from '../src/features/term-sense/usecases/archiveTermSense';

describe('archiveTermSense - partial-write protection', () => {
	it('returns term_version_conflict when term version changes before archiving sense', async () => {
		// This test simulates a race condition where:
		// 1. archiveTermSense reads the term (version=1)
		// 2. Another request modifies the term (version=2)
		// 3. archiveTermSense checks the term version again (version=2 !== 1)
		// 4. Should return conflict WITHOUT archiving the sense

		const userId = 'user-1';
		const termId = 'term-1';
		const senseId = 'sense-1';

		// Mock sense row
		const senseRow = {
			id: senseId,
			termId,
			bucket: 'frontend',
			text: 'test',
			source: 'manual' as const,
			version: 1,
			createdAt: new Date(),
			archivedAt: null,
		};

		// Mock term row (initially version 1)
		const termRow = {
			id: termId,
			userId,
			term: 'test',
			primarySenseId: senseId,
			version: 1,
			createdAt: new Date(),
			archivedAt: null,
		};

		// Mock term row after concurrent modification (version 2)
		const modifiedTermRow = {
			...termRow,
			version: 2,
		};

		// Create mock DB
		const mockDb = {
			query: {
				termSense: {
					findFirst: vi.fn().mockResolvedValue(senseRow),
				},
				term: {
					// First call returns version 1, second call (in guard check) returns version 2
					findFirst: vi
						.fn()
						.mockResolvedValueOnce(termRow) // Initial read
						.mockResolvedValueOnce(modifiedTermRow), // Guard check
				},
			},
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([]),
			}),
		} as unknown as DrizzleD1Database<typeof schema>;

		// Execute
		const result = await archiveTermSense(mockDb, userId, senseId, { expectedVersion: 1 });

		// Verify: should return term_version_conflict
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.type).toBe('term_version_conflict');
			expect(result.error.currentVersion).toBe(2);
		}

		// Verify: DB update should NOT be called (sense not archived)
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	it('returns term_version_conflict when term.primarySenseId changes before archiving', async () => {
		// Another race condition: term's primary sense changes during the operation
		const userId = 'user-1';
		const termId = 'term-1';
		const senseId = 'sense-1';
		const otherSenseId = 'sense-2';

		const senseRow = {
			id: senseId,
			termId,
			bucket: 'frontend',
			text: 'test',
			source: 'manual' as const,
			version: 1,
			createdAt: new Date(),
			archivedAt: null,
		};

		const termRow = {
			id: termId,
			userId,
			term: 'test',
			primarySenseId: senseId,
			version: 1,
			createdAt: new Date(),
			archivedAt: null,
		};

		// Term's primarySenseId changed to another sense
		const modifiedTermRow = {
			...termRow,
			primarySenseId: otherSenseId,
		};

		const mockDb = {
			query: {
				termSense: {
					findFirst: vi.fn().mockResolvedValue(senseRow),
				},
				term: {
					findFirst: vi.fn().mockResolvedValueOnce(termRow).mockResolvedValueOnce(modifiedTermRow), // primarySenseId changed
				},
			},
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([]),
			}),
		} as unknown as DrizzleD1Database<typeof schema>;

		const result = await archiveTermSense(mockDb, userId, senseId, { expectedVersion: 1 });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.type).toBe('term_version_conflict');
		}
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	it('proceeds normally when archiving non-primary sense (no guard check)', async () => {
		// When archiving a non-primary sense, the guard check shouldn't run
		const userId = 'user-1';
		const termId = 'term-1';
		const primarySenseId = 'sense-primary';
		const nonPrimarySenseId = 'sense-2';

		const senseRow = {
			id: nonPrimarySenseId,
			termId,
			bucket: 'backend',
			text: 'test',
			source: 'manual' as const,
			version: 1,
			createdAt: new Date(),
			archivedAt: null,
		};

		const termRow = {
			id: termId,
			userId,
			term: 'test',
			primarySenseId, // Different from the sense being archived
			version: 1,
			createdAt: new Date(),
			archivedAt: null,
		};

		const archivedSense = {
			...senseRow,
			version: 2,
			archivedAt: new Date(),
		};

		const mockDb = {
			query: {
				termSense: {
					findFirst: vi.fn().mockResolvedValue(senseRow),
				},
				term: {
					findFirst: vi.fn().mockResolvedValue(termRow),
				},
			},
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([archivedSense]),
			}),
		} as unknown as DrizzleD1Database<typeof schema>;

		const result = await archiveTermSense(mockDb, userId, nonPrimarySenseId, { expectedVersion: 1 });

		// Should succeed since it's not a primary sense
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.result.sense.archivedAt).toBeDefined();
			expect(result.result.term).toBeUndefined(); // Term not affected
		}

		// Verify term guard check was NOT performed (only one findFirst call for initial read)
		expect(mockDb.query.term.findFirst).toHaveBeenCalledTimes(1);
	});
});
