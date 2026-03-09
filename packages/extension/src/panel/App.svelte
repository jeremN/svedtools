<script lang="ts">
  import { getConnected, getSvelteDetected, getSvelteVersion } from './lib/connection.svelte.js';
  import ComponentTree from './components/ComponentTree.svelte';
  import StateInspector from './components/StateInspector.svelte';
  import ReactivityGraph from './components/ReactivityGraph.svelte';
  import Profiler from './components/Profiler.svelte';
  import UpdateTracer from './components/UpdateTracer.svelte';
  import { getSearchFilter, setSearchFilter } from './lib/components.svelte.js';

  const tabs = ['Components', 'Reactivity', 'Profiler', 'Tracer'] as const;
  type Tab = typeof tabs[number];
  let activeTab: Tab = $state('Components');

  let connected = $derived(getConnected());
  let svelteDetected = $derived(getSvelteDetected());
  let svelteVersion = $derived(getSvelteVersion());
  let searchFilter = $derived(getSearchFilter());
</script>

<div class="devtools">
  <nav class="tabs">
    {#each tabs as tab (tab)}
      <button
        class="tab"
        class:active={activeTab === tab}
        onclick={() => activeTab = tab}
      >
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
    background: #1e1e1e;
    color: #ccc;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid #333;
    background: #252525;
  }
  .tab {
    padding: 8px 16px;
    border: none;
    background: none;
    color: #888;
    cursor: pointer;
    font-size: 13px;
    border-bottom: 2px solid transparent;
  }
  .tab:hover { color: #ccc; }
  .tab.active {
    color: #ff3e00;
    border-bottom-color: #ff3e00;
  }
  .panel {
    flex: 1;
    padding: 0;
    overflow: auto;
  }
  .status-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: #1a1a1a;
    border-top: 1px solid #333;
    font-size: 11px;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot.disconnected { background: #e54545; }
  .status-dot.waiting { background: #cca700; }
  .status-dot.detected { background: #ff3e00; }
  .status-text.disconnected { color: #e54545; }
  .status-text.waiting { color: #cca700; }
  .status-text.detected { color: #ff3e00; }
  .components-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .search-bar {
    padding: 6px 8px;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }
  .search-bar input {
    width: 100%;
    padding: 4px 8px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 3px;
    color: #ccc;
    font-size: 12px;
    outline: none;
  }
  .search-bar input:focus {
    border-color: #ff3e00;
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
    background: #333;
    flex-shrink: 0;
  }
  .pane-right {
    flex: 1;
    overflow-y: auto;
    min-width: 200px;
  }
</style>
