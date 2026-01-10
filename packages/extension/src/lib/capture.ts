/**
 * Capture event creation helper.
 *
 * Creates capture events (term/question) with the same URL normalization
 * and hashing flow as heartbeats.
 */

import { ensureDeviceId } from './device';
import { getSettings } from './settings';
import type { Artifact, CaptureEvent, CaptureType } from './types';
import { computeUrlHash, normalizeUrlForHash } from './url';

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

interface CreateCaptureOptions {
	url: string;
	capture_type: CaptureType;
	label: string;
	note?: string;
}

/**
 * Create a capture event for the given URL.
 *
 * Returns null if:
 * - URL protocol is not http/https
 * - URL is invalid
 */
export async function createCaptureEvent(options: CreateCaptureOptions): Promise<CaptureEvent | null> {
	const { url, capture_type, label, note } = options;

	// Parse and validate URL
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		console.warn('[append][capture] invalid URL', url);
		return null;
	}

	// Protocol gating (http/https only)
	if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
		console.log('[append][capture] skipping non-http URL', parsedUrl.protocol);
		return null;
	}

	const deviceId = await ensureDeviceId();
	const settings = await getSettings();

	// Normalize URL and compute hash
	const normalizedUrl = normalizeUrlForHash(parsedUrl);
	const urlHash = await computeUrlHash(normalizedUrl);

	// Build artifact (optionally include hints)
	const artifact: Artifact = {
		url_hash: urlHash,
		host: parsedUrl.host,
	};

	if (settings.includeHints) {
		artifact.path_hint = parsedUrl.pathname;
		// Note: title is not available in this context, would need to be passed in
	}

	const event: CaptureEvent = {
		schema_version: 1,
		event_id: crypto.randomUUID(),
		device_id: deviceId,
		emitted_at: Date.now(),
		type: 'capture',
		artifact,
		payload: {
			capture_type,
			label: label.trim(),
			...(note?.trim() && { note: note.trim() }),
		},
	};

	return event;
}
