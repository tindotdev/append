import type { ManifestV3Export } from '@crxjs/vite-plugin';

const manifest: ManifestV3Export = {
	manifest_version: 3,
	name: 'Append',
	description: 'Track learning time on the web and capture notes in the moment.',
	version: '0.0.0',
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

export default manifest;
