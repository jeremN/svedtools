<script lang="ts">
	const installCmd = 'pnpm add -D vite-plugin-svelte-devtools';

	const viteConfig = `// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteDevtools } from 'vite-plugin-svelte-devtools';

export default defineConfig({
  plugins: [
    svelte(),
    svelteDevtools(),  // Add after svelte()
  ],
});`;

	const viteConfigWithOptions = `svelteDevtools({
  enabled: true, // default: true in dev, false in production
})`;
</script>

<article class="doc">
	<h1>Installation</h1>
	<p class="lead">Get the Svelte 5 DevTools running in under two minutes.</p>

	<section>
		<h2>1. Install the package</h2>
		<p>Add the Vite plugin as a dev dependency:</p>
		<pre><code>{installCmd}</code></pre>
		<p class="note">Also works with <code>npm install -D</code> or <code>yarn add -D</code>.</p>
	</section>

	<section>
		<h2>2. Configure Vite</h2>
		<p>
			Add <code>svelteDevtools()</code> to your Vite config, <strong>after</strong> the
			<code>svelte()</code> plugin:
		</p>
		<pre><code>{viteConfig}</code></pre>
		<p>You can pass options to control the plugin behavior:</p>
		<pre><code>{viteConfigWithOptions}</code></pre>
	</section>

	<section>
		<h2>3. Load the Chrome extension</h2>
		<ol>
			<li>Build the extension or locate the <code>packages/extension/dist</code> directory.</li>
			<li>
				Open Chrome and navigate to <code>chrome://extensions</code>.
			</li>
			<li>
				Enable <strong>Developer mode</strong> (toggle in the top-right corner).
			</li>
			<li>
				Click <strong>Load unpacked</strong> and select the <code>dist</code> directory.
			</li>
			<li>
				Open your Svelte app in the browser, then open DevTools (<kbd>F12</kbd>). You will see
				a <strong>Svelte</strong> panel tab.
			</li>
		</ol>
	</section>

	<section>
		<h2>Verify it works</h2>
		<p>
			Start your dev server (<code>pnpm dev</code>) and open a page that renders Svelte
			components. The DevTools panel should show the component tree in the
			<strong>Components</strong> tab.
		</p>
	</section>
</article>

<style>
	.doc {
		max-width: 42rem;
	}

	h1 {
		font-size: 1.75rem;
		margin-bottom: 0.5rem;
	}

	.lead {
		color: var(--text-muted);
		font-size: 1.05rem;
		margin-bottom: 2rem;
	}

	section {
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1.25rem;
		margin-bottom: 0.75rem;
	}

	p {
		margin-bottom: 0.75rem;
	}

	pre {
		background: var(--code-bg);
		color: var(--code-text);
		padding: 1rem;
		border-radius: 8px;
		overflow-x: auto;
		font-size: 0.85rem;
		line-height: 1.5;
		margin-bottom: 0.75rem;
	}

	code {
		font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace;
		font-size: 0.88em;
	}

	:global(.doc p > code),
	:global(.doc li > code) {
		background: #eee;
		padding: 0.15em 0.4em;
		border-radius: 3px;
	}

	ol {
		padding-left: 1.5rem;
		margin-bottom: 0.75rem;
	}

	li {
		margin-bottom: 0.4rem;
	}

	kbd {
		background: #eee;
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 0.1em 0.4em;
		font-size: 0.85em;
		font-family: inherit;
	}

	.note {
		color: var(--text-muted);
		font-size: 0.88rem;
	}
</style>
