<script lang="ts">
  import { getSelectedId, getStateSnapshot, getComponentMap } from '../lib/components.svelte.js';
  import ValueTree from './ValueTree.svelte';
  import { resetExpansion } from '../lib/expansion.svelte.js';

  let selectedId = $derived(getSelectedId());
  let stateSnapshot = $derived(getStateSnapshot());
  let componentMap = $derived(getComponentMap());
  let selectedComponent = $derived(selectedId ? componentMap[selectedId] : null);

  $effect(() => {
    void selectedId; // track selection; reset drill-down state when it changes
    resetExpansion();
  });

  function typeBadgeLabel(type: 'state' | 'derived' | 'props'): string {
    if (type === 'state') return '$state';
    if (type === 'derived') return '$derived';
    return '$props';
  }
</script>

<div class="state-inspector">
  <div class="header">
    {#if selectedComponent}
      <span class="header-name">{selectedComponent.name}</span>
    {:else}
      <span class="header-muted">Select a component</span>
    {/if}
  </div>

  {#if !selectedId}
    <div class="empty-state">Select a component to inspect its state</div>
  {:else if stateSnapshot && stateSnapshot.length > 0}
    <div class="signal-list">
      {#each stateSnapshot as signal (signal.id)}
        <div class="signal-row">
          <span class="type-badge type-{signal.type}">
            {typeBadgeLabel(signal.type)}
          </span>
          {#if signal.label}
            <span class="signal-label">{signal.label}</span>
          {:else}
            <span class="signal-label unnamed">unnamed</span>
          {/if}
          <span class="signal-value">
            <ValueTree rootId={signal.id} value={signal.value} />
          </span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty-state">No reactive state found</div>
  {/if}
</div>

<style>
  .state-inspector {
    padding: 12px;
    overflow-y: auto;
    font-family: monospace;
    color: #ccc;
  }

  .header {
    padding-bottom: 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid #2a2a2a;
  }

  .header-name {
    font-weight: bold;
    font-size: 14px;
    color: #e8ab6a;
  }

  .header-muted {
    color: #666;
    font-style: italic;
    font-size: 13px;
  }

  .signal-list {
    display: flex;
    flex-direction: column;
  }

  .signal-row {
    display: flex;
    align-items: flex-start;
    padding: 6px 8px;
    border-bottom: 1px solid #2a2a2a;
  }

  .type-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 600;
    font-family: monospace;
    flex-shrink: 0;
  }

  .type-state {
    background: #2d4a2d;
    color: #6abf6a;
  }

  .type-derived {
    background: #4a3d2d;
    color: #d4a843;
  }

  .type-props {
    background: #2d3a4a;
    color: #5b9bd5;
  }

  .signal-label {
    font-size: 13px;
    color: #ccc;
    margin-left: 8px;
    flex-shrink: 0;
  }

  .signal-label.unnamed {
    font-style: italic;
    color: #666;
  }

  .signal-value {
    font-size: 12px;
    font-family: monospace;
    margin-left: auto;
    text-align: right;
  }

  .empty-state {
    color: #666;
    padding: 16px;
    text-align: center;
    font-style: italic;
    font-size: 13px;
  }
</style>
