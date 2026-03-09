import { sveltekit } from '@sveltejs/kit/vite';
import { svelteDevtools } from 'vite-plugin-svelte-devtools';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), svelteDevtools()],
});
