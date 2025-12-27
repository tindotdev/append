import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = '.llm-cache';

interface CachedEntry<T = unknown> {
	prompt: string;
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

function getCachePath(provider: string): string {
	return join(CACHE_DIR, provider);
}

export function findCachedResponse<T = unknown>(provider: string, prompt: string): T | null {
	const dir = getCachePath(provider);
	if (!existsSync(dir)) return null;

	const hash = shortHash(prompt);
	const files = readdirSync(dir).filter((f) => f.includes(`_${hash}.json`));

	for (const file of files) {
		const data = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as CachedEntry<T>;
		if (data.prompt === prompt) return data.response;
	}
	return null;
}

export function cacheResponse(provider: string, prompt: string, response: unknown): void {
	const dir = getCachePath(provider);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const filename = `${timestamp()}_${slugify(prompt)}_${shortHash(prompt)}.json`;
	const data: CachedEntry = { prompt, response, cachedAt: new Date().toISOString() };

	writeFileSync(join(dir, filename), JSON.stringify(data, null, 2));
}
