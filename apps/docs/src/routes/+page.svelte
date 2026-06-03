<script lang="ts">
  import { resolve } from '$app/paths';
  import { dev } from '$app/environment';

  const quickstart = `// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteDevtools } from 'vite-plugin-svelte-devtools';

export default defineConfig({
  plugins: [
    svelte(),
    svelteDevtools(),
  ],
});`;
</script>

<div class="home">
  {#if !dev}
    <aside class="static-notice" role="note">
      <strong>Heads up:</strong> the DevTools panel won't activate on this static site. The Vite
      plugin only injects its runtime bridge in dev mode, so this prerendered page has nothing for
      the extension to attach to. Clone the repo and run <code>pnpm dev:docs</code> (or
      <code>pnpm dev</code> for the playground) to see it work.
    </aside>
  {/if}
  <h1>Svelte 5 DevTools</h1>
  <p class="tagline">Vite plugin + Chrome extension for inspecting Svelte 5 internals.</p>

  <div class="cards">
    <a href={resolve('/docs/installation')} class="card">
      <h3>Get Started</h3>
      <p>Install the plugin and load the extension in under two minutes.</p>
    </a>
    <a href={resolve('/docs/vite-plugin')} class="card">
      <h3>Vite Plugin</h3>
      <p>Learn how compile-time instrumentation powers the DevTools.</p>
    </a>
    <a href={resolve('/docs/extension')} class="card">
      <h3>Extension</h3>
      <p>Explore components, reactivity, profiling, and update tracing.</p>
    </a>
    <a href={resolve('/docs/architecture')} class="card">
      <h3>Architecture</h3>
      <p>Understand the data flow from compiled output to DevTools panel.</p>
    </a>
  </div>

  <section class="quickstart">
    <h2>Quick Start</h2>
    <pre><code>{quickstart}</code></pre>
    <p>
      Then <a href={resolve('/docs/installation')}>load the Chrome extension</a> and open DevTools to see the Svelte panel.
    </p>
  </section>

  <section class="links">
    <a href={resolve('/docs')} class="btn">Browse Documentation</a>
    <a href={resolve('/demos')} class="btn btn-outline">View Demos</a>
  </section>
</div>

<style>
  .home {
    max-width: 46rem;
  }

  .static-notice {
    background: #fff8e1;
    border: 1px solid #f0c36d;
    border-left: 4px solid #e6a700;
    border-radius: 8px;
    padding: 0.85rem 1rem;
    margin-bottom: 1.75rem;
    font-size: 0.9rem;
    color: #5a4500;
    line-height: 1.5;
  }

  .static-notice code {
    background: rgba(0, 0, 0, 0.06);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    font-size: 0.85em;
  }

  h1 {
    font-size: 2.25rem;
    font-weight: 800;
    margin-bottom: 0.5rem;
    color: var(--accent);
  }

  .tagline {
    font-size: 1.15rem;
    color: var(--text-muted);
    margin-bottom: 2rem;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2.5rem;
  }

  .card {
    display: block;
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    transition: border-color 0.15s;
  }

  .card:hover {
    border-color: var(--accent);
    text-decoration: none;
  }

  .card h3 {
    font-size: 1rem;
    margin-bottom: 0.35rem;
  }

  .card p {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .quickstart {
    margin-bottom: 2.5rem;
  }

  .quickstart h2 {
    font-size: 1.35rem;
    margin-bottom: 0.75rem;
  }

  pre {
    background: var(--code-bg);
    color: var(--code-text);
    padding: 1.25rem;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 0.85rem;
    line-height: 1.5;
    margin-bottom: 0.75rem;
  }

  .quickstart p {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .links {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-block;
    padding: 0.6rem 1.4rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    background: var(--accent);
    color: #fff;
    transition: background 0.15s;
  }

  .btn:hover {
    background: var(--accent-hover);
    text-decoration: none;
  }

  .btn-outline {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
  }

  .btn-outline:hover {
    background: var(--accent);
    color: #fff;
  }
</style>
