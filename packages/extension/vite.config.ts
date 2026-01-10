import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import zip from 'vite-plugin-zip-pack';
import manifest from './src/manifest';

export default defineConfig({
	plugins: [crx({ manifest }), zip({ outDir: 'release', outFileName: 'release.zip' })],
	build: {
		outDir: 'dist',
		emptyOutDir: true,
	},
});
