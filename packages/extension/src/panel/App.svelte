<script lang="ts">
  import { getConnected, getSvelteDetected, getSvelteVersion, getSvelteUntested } from './lib/connection.svelte.js';
  import ComponentTree from './components/ComponentTree.svelte';
  import StateInspector from './components/StateInspector.svelte';
  import ReactivityGraph from './components/ReactivityGraph.svelte';
  import Profiler from './components/Profiler.svelte';
  import UpdateTracer from './components/UpdateTracer.svelte';
  import { getSearchFilter, setSearchFilter } from './lib/components.svelte.js';

  const tabs = ['Components', 'Reactivity', 'Profiler', 'Tracer'] as const;
  type Tab = (typeof tabs)[number];
  let activeTab: Tab = $state('Components');

  let connected = $derived(getConnected());
  let svelteDetected = $derived(getSvelteDetected());
  let svelteVersion = $derived(getSvelteVersion());
  let svelteUntested = $derived(getSvelteUntested());
  let searchFilter = $derived(getSearchFilter());
</script>

<div class="devtools">
  {#if svelteDetected && svelteUntested}
    <div class="untested-banner" role="status">
      <strong>Heads up:</strong> Running an untested Svelte version ({svelteVersion}). DevTools features may misbehave.
    </div>
  {/if}
  <nav class="tabs">
    {#each tabs as tab (tab)}
      <button class="tab" class:active={activeTab === tab} onclick={() => (activeTab = tab)}>
        {tab}
      </button>
    {/each}
  </nav>

  <main class="panel">
    {#if activeTab === 'Components'}
      <div class="components-layout">
        <div class="search-bar">
          <input
            type="text"
            placeholder="Filter components..."
            value={searchFilter}
            oninput={(e) => setSearchFilter(e.currentTarget.value)}
          />
        </div>
        <div class="split-pane">
          <div class="pane-left">
            <ComponentTree />
          </div>
          <div class="pane-divider"></div>
          <div class="pane-right">
            <StateInspector />
          </div>
        </div>
      </div>
    {:else if activeTab === 'Reactivity'}
      <ReactivityGraph />
    {:else if activeTab === 'Profiler'}
      <Profiler />
    {:else}
      <UpdateTracer />
    {/if}
  </main>

  <footer class="status-bar">
    {#if !connected}
      <span class="status-dot disconnected"></span>
      <span class="status-text disconnected">Disconnected</span>
    {:else if !svelteDetected}
      <span class="status-dot waiting"></span>
      <span class="status-text waiting">Waiting for Svelte...</span>
    {:else}
      <span class="status-dot detected"></span>
      <span class="status-text detected">Svelte {svelteVersion}</span>
    {/if}
  </footer>
</div>

<style>
  .devtools {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--surface-base);
    color: var(--text-default);
    font-family: var(--font-ui);
  }

  /* -- Tab bar: active = brighter text + weight + flame underline (native pattern) -- */
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--surface-raised);
  }
  .tab {
    padding: var(--space-4) var(--space-6);
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--text-md);
    border-bottom: 2px solid transparent;
    transition:
      color var(--dur-fast) var(--ease-out),
      border-color var(--dur-fast) var(--ease-out);
  }
  .tab:hover {
    color: var(--text-default);
  }
  .tab.active {
    color: var(--text-strong);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }

  .panel {
    flex: 1;
    padding: 0;
    overflow: auto;
  }

  /* -- Status bar: dot shape (hollow ring vs solid) + label are the non-color cues -- */
  .status-bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-5);
    background: var(--surface-sunken);
    border-top: 1px solid var(--border-subtle);
    font-size: var(--text-sm);
  }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    box-sizing: border-box;
    flex-shrink: 0;
  }
  .status-dot.disconnected {
    background: transparent;
    border: 1.5px solid var(--status-danger); /* hollow ring = not connected */
  }
  .status-dot.waiting {
    background: var(--status-warn);
    animation: status-pulse 1.4s var(--ease-out) infinite;
  }
  .status-dot.detected {
    background: var(--accent); /* solid = live */
  }
  .status-text.disconnected {
    color: var(--status-danger);
  }
  .status-text.waiting {
    color: var(--status-warn);
  }
  .status-text.detected {
    color: var(--accent-text);
  }
  @keyframes status-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .components-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* -- Search -- */
  .search-bar {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }
  .search-bar input {
    width: 100%;
    padding: var(--space-2) var(--space-4);
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-default);
    font-size: var(--text-base);
    font-family: var(--font-ui);
    outline: none;
  }
  .search-bar input::placeholder {
    color: var(--text-muted);
  }
  .search-bar input:focus {
    border-color: var(--accent);
  }

  .split-pane {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .pane-left {
    flex: 1;
    overflow-y: auto;
    min-width: 200px;
  }
  .pane-divider {
    width: 1px;
    background: var(--border-subtle);
    flex-shrink: 0;
  }
  .pane-right {
    flex: 1;
    overflow-y: auto;
    min-width: 200px;
  }

  /* -- Untested-version banner (warn-tinted, full-width; no side stripe) -- */
  .untested-banner {
    padding: var(--space-3) var(--space-5);
    background: color-mix(in oklab, var(--status-warn) 16%, var(--surface-sunken));
    border-bottom: 1px solid color-mix(in oklab, var(--status-warn) 50%, transparent);
    color: var(--text-default);
    font-size: var(--text-base);
    flex-shrink: 0;
  }
  .untested-banner strong {
    color: var(--status-warn);
    margin-right: var(--space-2);
  }
</style>
