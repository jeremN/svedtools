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
      <strong>Heads up:</strong> the DevTools panel won't activate on this static site. The Vite plugin only injects its
      runtime bridge in dev mode, so this prerendered page has nothing for the extension to attach to. Clone the repo
      and run <code>pnpm dev:docs</code> (or <code>pnpm dev</code> for the playground) to see it work.
    </aside>
  {/if}

  <header class="hero">
    <h1>Svelte&nbsp;5 DevTools</h1>
    <p class="tagline">
      Inspect and edit Svelte 5 internals (the component tree, fine-grained reactivity, profiling, and update tracing)
      right inside Chrome DevTools.
    </p>
    <div class="cta">
      <a href={resolve('/docs/installation')} class="btn btn-primary">Get started</a>
      <a href={resolve('/demos')} class="btn btn-ghost">View demos</a>
    </div>
  </header>

  <section class="quickstart">
    <h2>Quick start</h2>
    <p class="section-lead">
      Add the plugin to your Vite config. It instruments your app in dev and injects the runtime bridge the panel reads.
    </p>
    <pre><code>{quickstart}</code></pre>
    <p class="muted">
      Then <a href={resolve('/docs/installation')}>load the Chrome extension</a> and open the <strong>Svelte</strong> tab
      in DevTools.
    </p>
  </section>

  <section class="explore">
    <h2>Explore</h2>
    <div class="topic-grid">
      <a href={resolve('/docs/installation')} class="topic topic-primary">
        <span class="topic-head">Get Started <span class="arrow" aria-hidden="true">→</span></span>
        <span class="topic-desc">Install the plugin and load the extension in under two minutes.</span>
      </a>
      <a href={resolve('/docs/vite-plugin')} class="topic">
        <span class="topic-head">Vite Plugin <span class="arrow" aria-hidden="true">→</span></span>
        <span class="topic-desc">How compile-time instrumentation powers the DevTools.</span>
      </a>
      <a href={resolve('/docs/extension')} class="topic">
        <span class="topic-head">Extension <span class="arrow" aria-hidden="true">→</span></span>
        <span class="topic-desc">Components, reactivity, profiling, and update tracing.</span>
      </a>
      <a href={resolve('/docs/architecture')} class="topic">
        <span class="topic-head">Architecture <span class="arrow" aria-hidden="true">→</span></span>
        <span class="topic-desc">Data flow from compiled output to the DevTools panel.</span>
      </a>
    </div>
  </section>
</div>

<style>
  .home {
    max-width: 50rem;
  }

  /* Full border + warn-tinted wash; no side-stripe accent. */
  .static-notice {
    background: var(--warn-wash);
    border: 1px solid color-mix(in oklab, var(--warn) 45%, transparent);
    border-radius: var(--radius-md);
    padding: 0.9rem 1.1rem;
    margin-bottom: 2rem;
    font-size: 0.9rem;
    color: var(--text);
    line-height: 1.55;
  }

  .static-notice strong {
    color: color-mix(in oklab, var(--warn) 65%, var(--text));
  }

  .static-notice code {
    background: color-mix(in oklab, var(--text) 8%, transparent);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.85em;
  }

  /* -- Hero -- */
  .hero {
    margin-bottom: 3rem;
  }

  h1 {
    font-size: clamp(2.4rem, 6vw, 3.4rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.05;
    color: var(--accent);
    text-wrap: balance;
    margin-bottom: 0.75rem;
  }

  .tagline {
    font-size: clamp(1.05rem, 2.2vw, 1.25rem);
    color: var(--text-muted);
    max-width: 40rem;
    text-wrap: pretty;
    margin-bottom: 1.5rem;
  }

  .cta {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-block;
    padding: 0.6rem 1.3rem;
    border-radius: var(--radius-sm);
    font-size: 0.92rem;
    font-weight: 600;
    border: 1px solid transparent;
    transition:
      background 0.14s,
      border-color 0.14s,
      color 0.14s;
  }

  .btn-primary {
    background: var(--accent-strong);
    color: oklch(0.99 0 0);
  }

  .btn-primary:hover {
    background: var(--accent-hover);
    color: oklch(0.99 0 0);
    text-decoration: none;
  }

  .btn-ghost {
    color: var(--text);
    border-color: var(--border-strong);
  }

  .btn-ghost:hover {
    border-color: var(--accent);
    color: var(--accent-strong);
    text-decoration: none;
  }

  /* -- Sections -- */
  section {
    margin-bottom: 3rem;
  }

  h2 {
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: 0.5rem;
  }

  .section-lead {
    color: var(--text-muted);
    font-size: 0.95rem;
    margin-bottom: 1rem;
    max-width: 42rem;
  }

  .muted {
    color: var(--text-muted);
    font-size: 0.95rem;
    margin-top: 0.75rem;
  }

  pre {
    background: var(--code-bg);
    color: var(--code-text);
    padding: 1.25rem 1.4rem;
    border-radius: var(--radius-md);
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    line-height: 1.6;
    border: 1px solid var(--border);
  }

  pre code {
    font-family: inherit;
  }

  /* -- Explore: asymmetric (primary spans, then secondary pair) -- */
  .topic-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.85rem;
  }

  .topic {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 1.15rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
    transition:
      border-color 0.14s,
      transform 0.14s;
  }

  .topic:hover {
    border-color: var(--accent);
    text-decoration: none;
    transform: translateY(-2px);
  }

  .topic-primary {
    grid-column: 1 / -1;
    background: var(--accent-wash);
    border-color: color-mix(in oklab, var(--accent) 30%, var(--border));
  }

  .topic-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
    font-size: 1rem;
    color: var(--text);
  }

  .topic-desc {
    color: var(--text-muted);
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .arrow {
    color: var(--accent-strong);
    transition: transform 0.14s;
  }

  .topic:hover .arrow {
    transform: translateX(3px);
  }

  @media (max-width: 720px) {
    .topic-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .btn,
    .topic,
    .arrow {
      transition: none;
    }

    .topic:hover {
      transform: none;
    }

    .topic:hover .arrow {
      transform: none;
    }
  }
</style>
