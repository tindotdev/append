import { defineManifest } from '@crxjs/vite-plugin';

// Stable extension ID for local development (enables consistent chrome-extension:// origin)
// This public key generates extension ID: nnhipglpoenbcdonkbnfdcmfcfaggjle
// Only included in dev builds; production builds get their ID from Chrome Web Store
const DEV_KEY =
	'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq2L9mAIXzjI5Wkqr6rwBSV0outKyC8IGM2VH0RcRdcLfd5RbKE8BcRjiqdYiquO+z1deUnUYzlK/aJZLb8Bfa5616lCX9KjjOQvWOi0y+ELrkHYC5WDoGQitsBgmU5mIaKm3ZE+Qddy/0Zj+9ri6pOqcIksZPbk35+v/4qclbhUwEcmGc8sMWae7MWhMewqIOuxbWsSX3D0uX7dbpwMKQq4iMhpGWXcUAo0iBWq+FLKZ2Obm9XuIxEO9RMs5XjqC4BfC1FmCVg8zXUiM2byaKSDnd1E8tMtLXj6b40/RG8rb1WyvUNvCdKNfA6l7O9VMYkM+suOwHbm95EAZZQZPrwIDAQAB';

export default defineManifest(async (env) => {
	const isDev = env.mode === 'development';

	return {
		manifest_version: 3,
		name: 'Append',
		description: 'Track learning time on the web and capture notes in the moment.',
		version: '0.0.0',
		// Conditionally include key only for development builds
		// Production builds (for Chrome Web Store) get their ID from the store
		...(isDev && { key: DEV_KEY }),
		icons: {
			16: 'icons/icon-16.png',
			32: 'icons/icon-32.png',
			48: 'icons/icon-192.png',
			128: 'icons/icon-192.png',
		},
		action: {
			default_title: 'Append',
			default_icon: {
				16: 'icons/icon-16.png',
				32: 'icons/icon-32.png',
				48: 'icons/icon-192.png',
				128: 'icons/icon-192.png',
			},
			default_popup: 'src/popup/index.html',
		},
		background: {
			service_worker: 'src/background.ts',
			type: 'module',
		},
		permissions: ['alarms', 'idle', 'storage', 'tabs'],
		host_permissions: ['http://*/*', 'https://*/*'],
		content_scripts: [
			{
				matches: ['http://*/*', 'https://*/*'],
				js: ['src/content.ts'],
				run_at: 'document_idle',
			},
		],
	};
});
