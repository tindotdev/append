import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = '.llm-cache';

export interface CacheKey<TModel extends string = string> {
	provider: string;
	model: TModel;
	prompt: string;
}

interface CachedEntry<T = unknown> extends CacheKey {
	response: T;
	cachedAt: string;
}

function slugify(text: string, maxLen = 40): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, maxLen);
}

function shortHash(text: string): string {
	return createHash('sha256').update(text).digest('hex').slice(0, 8);
}

function timestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function getCachePath({ provider, model }: Pick<CacheKey, 'provider' | 'model'>): string {
	return join(CACHE_DIR, provider, model);
}

export function findCachedResponse<T = unknown, TModel extends string = string>(key: CacheKey<TModel>): T | null {
	const dir = getCachePath(key);
	if (!existsSync(dir)) return null;

	const hash = shortHash(key.prompt);
	const files = readdirSync(dir).filter((f) => f.includes(`_${hash}.json`));

	for (const file of files) {
		const data = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as CachedEntry<T>;
		if (data.prompt === key.prompt) return data.response;
	}
	return null;
}

export function cacheResponse<TModel extends string = string>(key: CacheKey<TModel>, response: unknown): void {
	const dir = getCachePath(key);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const filename = `${timestamp()}_${slugify(key.prompt)}_${shortHash(key.prompt)}.json`;
	const entry: CachedEntry = { ...key, response, cachedAt: new Date().toISOString() };

	writeFileSync(join(dir, filename), JSON.stringify(entry, null, 2));
}
