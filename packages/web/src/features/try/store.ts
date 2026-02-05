import { normalizeTerm } from './normalize';
import { createSeedState } from './seed';
import type { TryBucket, TryBucketSlug, TryState, TryTerm } from './types';

const STORAGE_KEY = 'append.try.state.v1';

type Listener = () => void;

let listeners: Set<Listener> | null = null;
let cached: TryState | null = null;
let revision = 0;

let initState: 'uninitialized' | 'ready' = 'uninitialized';

function canUseStorage() {
	return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function notify() {
	revision += 1;
	for (const l of listeners ?? []) l();
}

function readFromStorage(): TryState | null {
	if (!canUseStorage()) return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed as TryState;
	} catch {
		return null;
	}
}

function writeToStorage(state: TryState) {
	if (!canUseStorage()) return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Ignore quota/storage errors. Trial mode should degrade gracefully.
	}
}

function ensureCached() {
	if (initState === 'ready' && cached) return;
	const existing = readFromStorage();
	cached = existing ?? createSeedState();
	writeToStorage(cached);
	initState = 'ready';
}

function setState(next: TryState) {
	cached = next;
	writeToStorage(next);
	notify();
}

export function subscribe(listener: Listener) {
	if (!listeners) listeners = new Set();
	listeners.add(listener);
	return () => listeners?.delete(listener);
}

export function getRevision() {
	return revision;
}

export function ensureTryReady() {
	ensureCached();
}

export function getTryState(): TryState {
	ensureCached();
	return cached as TryState;
}

export function listTryBuckets(): TryBucket[] {
	return getTryState()
		.buckets.slice()
		.sort((a, b) => a.order - b.order);
}

export function getTryBucket(slug: string): TryBucket | null {
	const s = slug as TryBucketSlug;
	return getTryState().buckets.find((b) => b.slug === s) ?? null;
}

export function listTryTermsByBucket(slug: string): TryTerm[] {
	const s = slug as TryBucketSlug;
	return getTryState()
		.terms.filter((t) => t.primarySense.bucket === s)
		.slice()
		.sort((a, b) => b.primarySense.createdAt - a.primarySense.createdAt);
}

export function upsertTryTerm(opts: { displayTerm: string; definition: string; bucket: TryBucketSlug; createdAtMs?: number }) {
	const state = getTryState();
	const nowMs = Date.now();
	const canonical = normalizeTerm(opts.displayTerm);
	const existing = state.terms.find((t) => t.canonical === canonical) ?? null;

	if (existing) {
		const next: TryTerm = {
			...existing,
			displayTerm: opts.displayTerm,
			termVersion: existing.termVersion + 1,
			source: 'user',
			primarySense: {
				...existing.primarySense,
				bucket: opts.bucket,
				text: opts.definition,
				version: existing.primarySense.version + 1,
			},
		};

		setState({
			...state,
			terms: state.terms.map((t) => (t.termId === existing.termId ? next : t)),
		});
		return { created: false as const, term: next };
	}

	const createdAtMs = opts.createdAtMs ?? nowMs;
	const term: TryTerm = {
		termId: crypto.randomUUID(),
		displayTerm: opts.displayTerm,
		canonical,
		termVersion: 1,
		source: 'user',
		primarySense: {
			id: crypto.randomUUID(),
			bucket: opts.bucket,
			text: opts.definition,
			createdAt: createdAtMs,
			version: 1,
		},
	};

	setState({
		...state,
		terms: [...state.terms, term],
	});

	return { created: true as const, term };
}

export function deleteTryTerm(termId: string) {
	const state = getTryState();
	setState({
		...state,
		terms: state.terms.filter((t) => t.termId !== termId),
	});
}

export function moveTryTerm(termId: string, bucket: TryBucketSlug) {
	const state = getTryState();
	const term = state.terms.find((t) => t.termId === termId);
	if (!term) return;

	const next: TryTerm = {
		...term,
		termVersion: term.termVersion + 1,
		primarySense: {
			...term.primarySense,
			bucket,
			version: term.primarySense.version + 1,
		},
	};

	setState({
		...state,
		terms: state.terms.map((t) => (t.termId === termId ? next : t)),
	});
}

export function resetTryToSeed() {
	const next = createSeedState();
	setState(next);
}

export function clearTryState() {
	cached = null;
	initState = 'uninitialized';
	if (canUseStorage()) {
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
	}
	notify();
}
