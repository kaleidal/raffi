import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			// See https://svelte.dev/docs/kit/adapter-cloudflare for more info
			routes: {
				include: ['/*'],
				exclude: ['<all>']
			}
		}),
		alias: {
			'@raffi/app': '../../packages/app',
			'@raffi/app/': '../../packages/app/'
		}
	}
};

export default config;
