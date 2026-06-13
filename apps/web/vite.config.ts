import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	resolve: {
		alias: {
			'@raffi/app': '../../packages/app',
			'@raffi/app/': '../../packages/app/',
		},
		dedupe: ['svelte'],
	},
	optimizeDeps: {
		// The shared @raffi/app package causes tsconfig scanning headaches when
		// Vite tries to pre-bundle it. We exclude it and load it purely on the client.
		exclude: ['@raffi/app']
	},
	server: {
		fs: {
			allow: ['../..']
		}
	}
});
