import { fromBase64Url, toBase64Url } from './encoding';

export function formatResultRef(prefix: string, value: string): string {
	return `${prefix}:${value}`;
}

export function parseResultRef(ref: string, prefix: string): string | null {
	const marker = `${prefix}:`;
	if (!ref.startsWith(marker)) return null;
	return ref.slice(marker.length);
}

export function encodeJsonResultRef<T>(prefix: string, value: T): string {
	return formatResultRef(prefix, toBase64Url(JSON.stringify(value)));
}

export function decodeJsonResultRef<T>(prefix: string, ref: string): T | null {
	const payload = parseResultRef(ref, prefix);
	if (!payload) return null;
	try {
		return JSON.parse(fromBase64Url(payload)) as T;
	} catch {
		return null;
	}
}
