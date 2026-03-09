<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<div class="docs-index">
  <h1>Documentation</h1>
  <p class="lead">Everything you need to instrument, inspect, and debug your Svelte 5 applications.</p>

  <ul class="toc">
    <li>
      <a href={resolve('/docs/installation')}>
        <strong>Installation</strong>
        <span>Install the npm package, configure Vite, and load the Chrome extension.</span>
      </a>
    </li>
    <li>
      <a href={resolve('/docs/vite-plugin')}>
        <strong>Vite Plugin</strong>
        <span>Plugin options, AST transforms, and instrumentation patterns.</span>
      </a>
    </li>
    <li>
      <a href={resolve('/docs/extension')}>
        <strong>Extension</strong>
        <span>Load the unpacked extension, explore panel tabs, and understand the bridge.</span>
      </a>
    </li>
    <li>
      <a href={resolve('/docs/architecture')}>
        <strong>Architecture</strong>
        <span>System diagram, data flow, wire protocol, and key concepts.</span>
      </a>
    </li>
  </ul>
</div>

<style>
  .docs-index {
    max-width: 40rem;
  }

  h1 {
    font-size: 1.75rem;
    margin-bottom: 0.5rem;
  }

  .lead {
    color: var(--text-muted);
    margin-bottom: 2rem;
    font-size: 1.05rem;
  }

  .toc {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .toc a {
    display: block;
    padding: 1rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    transition: border-color 0.15s;
  }

  .toc a:hover {
    border-color: var(--accent);
    text-decoration: none;
  }

  .toc strong {
    display: block;
    font-size: 1rem;
    margin-bottom: 0.2rem;
  }

  .toc span {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
</style>
