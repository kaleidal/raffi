import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter({
				routes: {
					include: ['/*'],
					exclude: ['<all>']
				}
			})
		})
	],
	resolve: {
		dedupe: ['svelte'],
	},
	optimizeDeps: {
		// The shared @raffi/app package causes tsconfig scanning headaches when
		// Vite tries to pre-bundle it. We exclude it and load it purely on the client.
		exclude: ['@raffi/app']
	},
	server: {
		port: 43174,
		strictPort: true,
		fs: {
			allow: ['../..']
		}
	}
});
