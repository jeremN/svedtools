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
    padding: var(--space-5);
    overflow-y: auto;
    font-family: var(--font-mono);
    color: var(--text-default);
  }

  .header {
    padding-bottom: var(--space-4);
    margin-bottom: var(--space-4);
    border-bottom: 1px solid var(--border-subtle);
  }

  .header-name {
    font-weight: 600;
    font-size: var(--text-lg);
    color: var(--text-strong);
  }

  .header-muted {
    color: var(--text-muted);
    font-style: italic;
    font-size: var(--text-md);
  }

  .signal-list {
    display: flex;
    flex-direction: column;
  }

  .signal-row {
    display: flex;
    align-items: flex-start;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-subtle);
  }

  /* Signal kind: a neutral chip; the $state / $derived / $props keyword carries the meaning. */
  .type-badge {
    font-size: var(--text-xs);
    padding: 1px var(--space-3);
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-family: var(--font-mono);
    flex-shrink: 0;
    background: var(--surface-overlay);
    color: var(--text-muted);
  }

  .signal-label {
    font-size: var(--text-md);
    color: var(--text-default);
    margin-left: var(--space-4);
    flex-shrink: 0;
  }

  .signal-label.unnamed {
    font-style: italic;
    color: var(--text-faint);
  }

  .signal-value {
    font-size: var(--text-base);
    font-family: var(--font-mono);
    margin-left: auto;
    text-align: right;
  }

  .empty-state {
    color: var(--text-muted);
    padding: var(--space-6);
    text-align: center;
    font-style: italic;
    font-size: var(--text-md);
  }
</style>
