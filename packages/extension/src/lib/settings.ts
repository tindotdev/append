import { clearAuthError } from './outbox';

const API_BASE_URL_KEY = 'append_api_base_url';
const DEVICE_TOKEN_KEY = 'append_device_token';
const INCLUDE_HINTS_KEY = 'append_include_hints';

export type ExtensionSettings = {
	apiBaseUrl: string;
	deviceToken: string | null;
	/** Send path_hint and title_hint with heartbeats (privacy opt-in, default: false) */
	includeHints: boolean;
};

export const DEFAULT_API_BASE_URL = 'http://localhost:8787';

function normalizeBaseUrl(input: string): string {
	const trimmed = input.trim();
	const withoutTrailing = trimmed.replace(/\/+$/, '');
	return withoutTrailing;
}

export async function getSettings(): Promise<ExtensionSettings> {
	const raw = await chrome.storage.local.get([API_BASE_URL_KEY, DEVICE_TOKEN_KEY, INCLUDE_HINTS_KEY]);
	const apiBaseUrl =
		typeof raw[API_BASE_URL_KEY] === 'string' && raw[API_BASE_URL_KEY].trim().length > 0
			? normalizeBaseUrl(raw[API_BASE_URL_KEY])
			: DEFAULT_API_BASE_URL;
	const deviceToken =
		typeof raw[DEVICE_TOKEN_KEY] === 'string' && raw[DEVICE_TOKEN_KEY].trim().length > 0 ? raw[DEVICE_TOKEN_KEY].trim() : null;
	const includeHints = raw[INCLUDE_HINTS_KEY] === true;
	return { apiBaseUrl, deviceToken, includeHints };
}

export async function setSettings(partial: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
	const current = await getSettings();
	const next: ExtensionSettings = {
		apiBaseUrl: partial.apiBaseUrl ? normalizeBaseUrl(partial.apiBaseUrl) : current.apiBaseUrl,
		deviceToken: partial.deviceToken === undefined ? current.deviceToken : partial.deviceToken?.trim() || null,
		includeHints: partial.includeHints ?? current.includeHints,
	};

	await chrome.storage.local.set({
		[API_BASE_URL_KEY]: next.apiBaseUrl,
		[DEVICE_TOKEN_KEY]: next.deviceToken ?? '',
		[INCLUDE_HINTS_KEY]: next.includeHints,
	});

	// If device token was updated, clear any auth errors to allow retrying
	if (partial.deviceToken !== undefined && next.deviceToken !== current.deviceToken) {
		await clearAuthError();
	}

	return next;
}
