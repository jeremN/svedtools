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
    <a href={resolve('/')} class="logo">svedtools</a>
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

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    line-height: 1.6;
    color: var(--text);
    background: var(--bg);
  }

  :global(:root) {
    --bg: #fafafa;
    --text: #1a1a2e;
    --text-muted: #555;
    --sidebar-bg: #f0f0f5;
    --sidebar-width: 240px;
    --border: #ddd;
    --accent: #ff3e00;
    --accent-hover: #e63600;
    --code-bg: #2d2d2d;
    --code-text: #ccc;
    --link: #0066cc;
    --link-hover: #004499;
    --topbar-height: 52px;
  }

  :global(a) {
    color: var(--link);
    text-decoration: none;
  }

  :global(a:hover) {
    color: var(--link-hover);
    text-decoration: underline;
  }

  .app {
    min-height: 100vh;
  }

  .topbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--topbar-height);
    background: var(--sidebar-bg);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 1rem;
    gap: 0.75rem;
    z-index: 100;
  }

  .logo {
    font-weight: 700;
    font-size: 1.15rem;
    color: var(--accent);
    letter-spacing: -0.5px;
  }

  .logo:hover {
    color: var(--accent-hover);
    text-decoration: none;
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
    padding: 1.5rem 1rem;
    overflow-y: auto;
  }

  .sidebar section {
    margin-bottom: 1.5rem;
  }

  .sidebar h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .sidebar ul {
    list-style: none;
  }

  .sidebar li {
    margin-bottom: 0.25rem;
  }

  .sidebar a {
    display: block;
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    font-size: 0.9rem;
    color: var(--text);
  }

  .sidebar a:hover {
    background: var(--border);
    text-decoration: none;
  }

  .content {
    flex: 1;
    margin-left: var(--sidebar-width);
    padding: 2rem 3rem;
    max-width: 52rem;
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
      padding: 1.5rem 1rem;
    }
  }
</style>
