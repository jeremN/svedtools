<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolve } from '$app/paths';

  let { children }: { children: Snippet } = $props();

  let sidebarOpen = $state(false);
</script>

<div class="app">
  <header class="topbar">
    <button class="menu-toggle" onclick={() => (sidebarOpen = !sidebarOpen)} aria-label="Toggle menu">
      {#if sidebarOpen}
        &#x2715;
      {:else}
        &#9776;
      {/if}
    </button>
    <a href={resolve('/')} class="logo"><span class="logo-mark" aria-hidden="true"></span>svedtools</a>
  </header>

  <div class="shell">
    <nav class="sidebar" class:open={sidebarOpen}>
      <section>
        <h3>Documentation</h3>
        <ul>
          <li><a href={resolve('/docs/installation')} onclick={() => (sidebarOpen = false)}>Installation</a></li>
          <li><a href={resolve('/docs/vite-plugin')} onclick={() => (sidebarOpen = false)}>Vite Plugin</a></li>
          <li><a href={resolve('/docs/extension')} onclick={() => (sidebarOpen = false)}>Extension</a></li>
          <li><a href={resolve('/docs/architecture')} onclick={() => (sidebarOpen = false)}>Architecture</a></li>
          <li><a href={resolve('/docs/troubleshooting')} onclick={() => (sidebarOpen = false)}>Troubleshooting</a></li>
        </ul>
      </section>
      <section>
        <h3>Demos</h3>
        <ul>
          <li><a href={resolve('/demos')} onclick={() => (sidebarOpen = false)}>All Demos</a></li>
          <li><a href={resolve('/demos/counter')} onclick={() => (sidebarOpen = false)}>Counter</a></li>
          <li><a href={resolve('/demos/nested-state')} onclick={() => (sidebarOpen = false)}>Nested State</a></li>
          <li><a href={resolve('/demos/effect-chain')} onclick={() => (sidebarOpen = false)}>Effect Chain</a></li>
          <li><a href={resolve('/demos/todo-list')} onclick={() => (sidebarOpen = false)}>Todo List</a></li>
          <li><a href={resolve('/demos/context')} onclick={() => (sidebarOpen = false)}>Context</a></li>
        </ul>
      </section>
    </nav>

    <main class="content">
      {@render children()}
    </main>
  </div>
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(:root) {
    /* Light brand theme — flame identity, OKLCH, AA-verified. Code surfaces echo
       the dark DevTools panel so the docs and the tool read as one product. */
    --bg: oklch(0.985 0.001 255);
    --surface: oklch(0.968 0.002 255);
    --surface-2: oklch(0.935 0.003 255);
    --text: oklch(0.27 0.02 265);
    --text-muted: oklch(0.5 0.015 265);
    --border: oklch(0.9 0.004 255);
    --border-strong: oklch(0.82 0.006 255);

    --accent: oklch(0.66 0.24 36); /* Svelte flame #ff3e00 — marks + large headings */
    --accent-strong: oklch(0.55 0.21 32); /* links, buttons, small accent text (AA on bg) */
    --accent-hover: oklch(0.48 0.19 32);
    --accent-wash: color-mix(in oklab, var(--accent) 10%, var(--bg));

    --code-bg: oklch(0.21 0.006 255);
    --code-text: oklch(0.86 0.004 255);
    --code-inline-bg: var(--surface-2);

    --warn: oklch(0.62 0.13 75);
    --warn-wash: color-mix(in oklab, var(--warn) 14%, var(--bg));

    --link: var(--accent-strong);
    --link-hover: var(--accent-hover);

    --sidebar-bg: var(--surface);
    --sidebar-width: 248px;
    --topbar-height: 56px;

    --font-ui: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    --radius-sm: 6px;
    --radius-md: 10px;
  }

  :global(body) {
    font-family: var(--font-ui);
    line-height: 1.65;
    color: var(--text);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
  }

  :global(a) {
    color: var(--link);
    text-decoration: none;
  }

  :global(a:hover) {
    color: var(--link-hover);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  :global(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .app {
    min-height: 100vh;
  }

  .topbar {
    position: fixed;
    inset: 0 0 auto 0;
    height: var(--topbar-height);
    background: color-mix(in oklab, var(--bg) 86%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 1.25rem;
    gap: 0.75rem;
    z-index: 100;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: -0.02em;
    color: var(--text);
  }

  .logo:hover {
    color: var(--text);
    text-decoration: none;
  }

  .logo-mark {
    width: 15px;
    height: 15px;
    border-radius: 4px;
    background: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-wash);
  }

  .menu-toggle {
    display: none;
    background: none;
    border: none;
    font-size: 1.4rem;
    cursor: pointer;
    color: var(--text);
    padding: 0.25rem;
  }

  .shell {
    display: flex;
    padding-top: var(--topbar-height);
    min-height: 100vh;
  }

  .sidebar {
    position: fixed;
    top: var(--topbar-height);
    left: 0;
    bottom: 0;
    width: var(--sidebar-width);
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    padding: 1.75rem 1rem;
    overflow-y: auto;
  }

  .sidebar section {
    margin-bottom: 1.75rem;
  }

  .sidebar h3 {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 0.6rem;
    padding-left: 0.5rem;
  }

  .sidebar ul {
    list-style: none;
  }

  .sidebar li {
    margin-bottom: 0.1rem;
  }

  .sidebar a {
    display: block;
    padding: 0.35rem 0.6rem;
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    color: var(--text-muted);
    transition:
      color 0.12s,
      background 0.12s;
  }

  .sidebar a:hover {
    background: var(--surface-2);
    color: var(--text);
    text-decoration: none;
  }

  .content {
    flex: 1;
    margin-left: var(--sidebar-width);
    padding: 2.5rem 3rem;
    max-width: 54rem;
  }

  @media (max-width: 768px) {
    .menu-toggle {
      display: block;
    }

    .sidebar {
      transform: translateX(-100%);
      transition: transform 0.2s ease;
      z-index: 50;
    }

    .sidebar.open {
      transform: translateX(0);
    }

    .content {
      margin-left: 0;
      padding: 1.5rem 1.15rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar {
      transition: none;
    }
  }
</style>
