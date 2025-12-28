import { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ApiRequestError } from '@/lib/api-client';
import { createBatch } from '../api/create-batch';

const TERM_MIN = 20;
const TERM_MAX = 200;

function parseTerms(input: string): string[] {
	return input
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function getCountHint(termCount: number): string | null {
	if (termCount === 0) {
		return null;
	}
	if (termCount < TERM_MIN) {
		return `need ${TERM_MIN - termCount} more`;
	}
	if (termCount > TERM_MAX) {
		return `${termCount - TERM_MAX} over limit`;
	}
	return null;
}

function getBatchErrorMessage(err: unknown): string {
	if (err instanceof ApiRequestError) {
		if (err.code === 'IDEMPOTENCY_CONFLICT') {
			return 'Request conflict. Please modify your input and try again.';
		}
		if (err.code === 'UNAUTHORIZED') {
			return 'Your session has expired. Please sign in again.';
		}
		return err.message;
	}
	return 'An unexpected error occurred. Please try again.';
}

export function BatchNewPage() {
	const navigate = useNavigate();
	const [terms, setTerms] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Track clientRequestId: generate once per submit attempt, regenerate on edit after failure
	const clientRequestIdRef = useRef<string | null>(null);
	const hasFailedRef = useRef(false);

	const parsedTerms = useMemo(() => parseTerms(terms), [terms]);
	const termCount = parsedTerms.length;
	const isValidCount = termCount >= TERM_MIN && termCount <= TERM_MAX;
	const countHint = getCountHint(termCount);

	const handleTermsChange = useCallback((value: string) => {
		setTerms(value);
		// If user edits after a failure, clear the clientRequestId so we generate a new one
		if (hasFailedRef.current) {
			clientRequestIdRef.current = null;
			hasFailedRef.current = false;
		}
		setError(null);
	}, []);

	const handleSubmit = useCallback(async () => {
		if (!isValidCount) {
			setError(`Please enter between ${TERM_MIN} and ${TERM_MAX} terms (one per line).`);
			return;
		}

		// Generate clientRequestId if we don't have one
		if (!clientRequestIdRef.current) {
			clientRequestIdRef.current = crypto.randomUUID();
		}

		setIsSubmitting(true);
		setError(null);

		try {
			const response = await createBatch({
				terms,
				clientRequestId: clientRequestIdRef.current,
			});

			// Success - navigate to the batch page
			navigate({ to: '/batch/$batchId', params: { batchId: response.id } });
		} catch (err: unknown) {
			hasFailedRef.current = true;
			setError(getBatchErrorMessage(err));
		} finally {
			setIsSubmitting(false);
		}
	}, [terms, isValidCount, navigate]);

	return (
		<div className="max-w-2xl">
			<h2 className="text-xl font-semibold">Capture New Batch</h2>
			<p className="mt-2 text-zinc-400">Enter your terms, one per line. Brain dump welcome — duplicates and rough ideas are fine.</p>

			<div className="mt-6">
				<textarea
					value={terms}
					onChange={(e) => handleTermsChange(e.target.value)}
					placeholder="Enter terms here, one per line..."
					className="w-full h-64 bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none font-mono text-sm"
					disabled={isSubmitting}
				/>

				<div className="mt-2 flex items-center justify-between">
					<span className={`text-sm ${isValidCount ? 'text-zinc-400' : 'text-amber-500'}`}>
						{termCount} term{termCount !== 1 ? 's' : ''}
						{countHint && <span className="ml-1">({countHint})</span>}
					</span>
					<span className="text-sm text-zinc-500">
						{TERM_MIN}–{TERM_MAX} terms required
					</span>
				</div>

				{error && <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">{error}</div>}

				<button
					type="button"
					onClick={handleSubmit}
					disabled={isSubmitting || !isValidCount}
					className="mt-4 w-full rounded-lg bg-white px-4 py-2.5 text-black font-medium hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSubmitting ? 'Submitting...' : 'Submit Batch'}
				</button>
			</div>
		</div>
	);
}
