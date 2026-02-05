import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
	clearTryState,
	deleteTryTerm,
	ensureTryReady,
	getRevision,
	getTryBucket,
	getTryState,
	listTryBuckets,
	listTryTermsByBucket,
	moveTryTerm,
	resetTryToSeed,
	subscribe,
	upsertTryTerm,
} from './store';
import type { TryBucketSlug, TryTerm } from './types';

export function useTryReady() {
	const revision = useSyncExternalStore(subscribe, getRevision, getRevision);

	useEffect(() => {
		ensureTryReady();
	}, []);

	return { revision };
}

export function useTryBuckets() {
	const { revision } = useTryReady();
	return useMemo(() => ({ revision, buckets: listTryBuckets() }), [revision]);
}

export function useTryBucket(slug: string) {
	const { revision } = useTryReady();
	return useMemo(() => ({ revision, bucket: getTryBucket(slug) }), [revision, slug]);
}

export function useTryBucketTerms(slug: string) {
	const { revision } = useTryReady();
	return useMemo(() => ({ revision, terms: listTryTermsByBucket(slug) }), [revision, slug]);
}

export function useTryActions() {
	useTryReady();

	return useMemo(
		() => ({
			upsertTryTerm,
			deleteTryTerm,
			moveTryTerm,
			resetTryToSeed,
			clearTryState,
			getTryState,
		}),
		[]
	);
}

export function useTryExportTermsForSync(): Array<{
	clientTermId: string;
	term: string;
	definition: string;
	bucketSlug: TryBucketSlug;
	createdAtMs: number;
}> {
	const { revision } = useTryReady();

	return useMemo(() => {
		void revision;
		const state = getTryState();
		return state.terms
			.filter((t) => t.source === 'user')
			.map((t: TryTerm) => ({
				clientTermId: t.termId,
				term: t.displayTerm,
				definition: t.primarySense.text,
				bucketSlug: t.primarySense.bucket,
				createdAtMs: t.primarySense.createdAt,
			}));
	}, [revision]);
}
