/**
 * Use case: Get a term with all its senses for the detail panel.
 */

import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { type schema, termSense } from '../../../db';
import { requireTermOwned } from '../../../shared/queries';

/**
 * Term result with all senses.
 */
export interface TermDetailResult {
	term: {
		id: string;
		displayTerm: string;
		canonical: string;
		version: number;
		createdAt: number;
	};
	senses: Array<{
		id: string;
		bucket: string;
		text: string;
		source: string;
		senseLabel: string | null;
		flaggedReason: string | null;
		version: number;
		createdAt: number;
		isPrimary: boolean;
	}>;
}

/**
 * Possible errors from getTerm.
 */
export type GetTermError = { type: 'not_found' } | { type: 'forbidden' };

/**
 * Get a term with all its senses.
 */
export async function getTerm(
	db: DrizzleD1Database<typeof schema>,
	userId: string,
	termId: string
): Promise<{ success: true; result: TermDetailResult } | { success: false; error: GetTermError }> {
	// 1. Lookup term
	const termOwnership = await requireTermOwned(db, userId, termId);
	if (!termOwnership.ok) {
		return { success: false, error: { type: termOwnership.error } };
	}
	const termRow = termOwnership.value;

	// 3. Get all non-archived senses for this term
	const senses = await db.query.termSense.findMany({
		where: and(eq(termSense.termId, termId), isNull(termSense.archivedAt)),
		orderBy: (ts, { desc }) => [desc(ts.createdAt)],
	});

	return {
		success: true,
		result: {
			term: {
				id: termRow.id,
				displayTerm: termRow.displayTerm,
				canonical: termRow.canonical,
				version: termRow.version,
				createdAt: termRow.createdAt.getTime(),
			},
			senses: senses.map((s) => ({
				id: s.id,
				bucket: s.bucket,
				text: s.text,
				source: s.source,
				senseLabel: s.senseLabel,
				flaggedReason: s.flaggedReason,
				version: s.version,
				createdAt: s.createdAt.getTime(),
				isPrimary: termRow.primarySenseId === s.id,
			})),
		},
	};
}
