import { beforeEach, describe, expect, it } from 'vitest';
import { clearTryState, ensureTryReady, getTryState, listTryBuckets, listTryTermsByBucket, resetTryToSeed, upsertTryTerm } from './store';

describe('try store', () => {
	beforeEach(() => {
		clearTryState();
	});

	it('seeds state on first load', () => {
		ensureTryReady();
		const state = getTryState();
		expect(state.buckets.length).toBeGreaterThan(0);
		expect(state.terms.length).toBeGreaterThan(0);
	});

	it('upserts terms by canonical', () => {
		ensureTryReady();
		const before = getTryState().terms.length;
		const first = upsertTryTerm({ displayTerm: 'Vector clock', definition: 'A', bucket: 'backend' });
		expect(first.created).toBe(true);
		expect(getTryState().terms.length).toBe(before + 1);

		const second = upsertTryTerm({ displayTerm: ' vector   clock ', definition: 'B', bucket: 'backend' });
		expect(second.created).toBe(false);
		expect(getTryState().terms.length).toBe(before + 1);
		expect(getTryState().terms.find((t) => t.canonical === 'vector clock')?.primarySense.text).toBe('B');
	});

	it('lists terms by bucket', () => {
		ensureTryReady();
		resetTryToSeed();
		upsertTryTerm({ displayTerm: 'X', definition: 'Y', bucket: 'frontend' });
		const items = listTryTermsByBucket('frontend');
		expect(items.some((t) => t.canonical === 'x')).toBe(true);
	});

	it('lists buckets ordered by order', () => {
		ensureTryReady();
		const buckets = listTryBuckets();
		expect(buckets[0]?.order).toBe(0);
	});
});
