import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearTryState,
	deleteTryTerm,
	ensureTryReady,
	getTryState,
	listTryBuckets,
	listTryTermsByBucket,
	moveTryTerm,
	resetTryToSeed,
	upsertTryTerm,
} from './store';

describe('try store', () => {
	const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

	function setLocalStorage(descriptor: PropertyDescriptor) {
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			...descriptor,
		});
	}

	function restoreLocalStorage() {
		if (!originalLocalStorageDescriptor) return;
		Object.defineProperty(window, 'localStorage', originalLocalStorageDescriptor);
	}

	beforeEach(() => {
		restoreLocalStorage();
		clearTryState();
	});

	afterEach(() => {
		restoreLocalStorage();
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

	it('moves term between buckets and increments versions', () => {
		ensureTryReady();
		const { term } = upsertTryTerm({ displayTerm: 'CRDT', definition: 'Conflict-free replicated data type', bucket: 'backend' });

		const beforeMove = getTryState().terms.find((t) => t.termId === term.termId);
		expect(beforeMove?.primarySense.bucket).toBe('backend');
		const beforeTermVersion = beforeMove?.termVersion ?? 0;
		const beforeSenseVersion = beforeMove?.primarySense.version ?? 0;

		moveTryTerm(term.termId, 'frontend');

		const afterMove = getTryState().terms.find((t) => t.termId === term.termId);
		expect(afterMove?.primarySense.bucket).toBe('frontend');
		expect(afterMove?.termVersion).toBe(beforeTermVersion + 1);
		expect(afterMove?.primarySense.version).toBe(beforeSenseVersion + 1);
	});

	it('deletes term by termId', () => {
		ensureTryReady();
		resetTryToSeed();
		const { term: term1 } = upsertTryTerm({ displayTerm: 'GraphQL', definition: 'Query language for APIs', bucket: 'backend' });
		const { term: term2 } = upsertTryTerm({ displayTerm: 'REST', definition: 'Representational state transfer', bucket: 'backend' });

		const beforeDelete = getTryState().terms.length;
		expect(getTryState().terms.find((t) => t.termId === term1.termId)).toBeDefined();
		expect(getTryState().terms.find((t) => t.termId === term2.termId)).toBeDefined();

		deleteTryTerm(term1.termId);

		expect(getTryState().terms.length).toBe(beforeDelete - 1);
		expect(getTryState().terms.find((t) => t.termId === term1.termId)).toBeUndefined();
		expect(getTryState().terms.find((t) => t.termId === term2.termId)).toBeDefined();
	});

	it('does not warn when localStorage is present but unusable', () => {
		setLocalStorage({ value: {} });
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		expect(() => ensureTryReady()).not.toThrow();
		expect(warn).not.toHaveBeenCalled();

		warn.mockRestore();
	});

	it('does not warn when accessing localStorage throws', () => {
		setLocalStorage({
			get() {
				throw new Error('blocked');
			},
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		expect(() => ensureTryReady()).not.toThrow();
		expect(warn).not.toHaveBeenCalled();

		warn.mockRestore();
	});

	it('warns at most once if persistence fails after probe', () => {
		setLocalStorage({
			value: {
				getItem: () => null,
				setItem: (key: string) => {
					if (key.endsWith('.probe')) return;
					throw new Error('quota');
				},
				removeItem: () => {},
			} as unknown as Storage,
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		ensureTryReady();
		upsertTryTerm({ displayTerm: 'A', definition: 'B', bucket: 'backend' });
		upsertTryTerm({ displayTerm: 'C', definition: 'D', bucket: 'backend' });

		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});
});
