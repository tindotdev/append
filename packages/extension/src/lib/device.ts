const DEVICE_ID_KEY = 'append_device_id';

export async function ensureDeviceId(): Promise<string> {
	const current = await chrome.storage.local.get(DEVICE_ID_KEY);
	const existing = current[DEVICE_ID_KEY];
	if (typeof existing === 'string' && existing.length > 0) return existing;

	const generated = crypto.randomUUID();
	await chrome.storage.local.set({ [DEVICE_ID_KEY]: generated });
	return generated;
}
