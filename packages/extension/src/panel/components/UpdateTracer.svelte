<script lang="ts">
  import { getTraces, getSelectedTraceId, getSelectedTrace, selectTrace, clearTraces } from '../lib/tracer.svelte.js';
  import type {
    UpdateChainStep,
    DomMutation,
    SerializedValue,
    SerializedObject,
    SerializedArray,
  } from '@svelte-devtools/shared';

  let traces = $derived(getTraces());
  let selectedId = $derived(getSelectedTraceId());
  let selectedTrace = $derived(getSelectedTrace());
  let showStack = $state(false);
  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(id);
  });

  let sortedTraces = $derived([...traces].reverse());

  function formatTimeAgo(timestamp: number): string {
    const seconds = Math.round((now - timestamp) / 1000);
    if (seconds < 60) return seconds + 's ago';
    const minutes = Math.floor(seconds / 60);
    return minutes + 'm ago';
  }

  function formatValue(value: SerializedValue | null): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return '"' + value + '"';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object' && '__type' in value) {
      if (value.__type === 'object') return (value as SerializedObject).preview;
      if (value.__type === 'array') return 'Array(' + (value as SerializedArray).length + ')';
      if (value.__type === 'dom') return '<' + (value as { __type: 'dom'; tag: string }).tag + '>';
      if (value.__type === 'circular') return '[Circular]';
      if (value.__type === 'truncated') return (value as { __type: 'truncated'; reason: string }).reason;
    }
    return String(value);
  }

  function stepTypeBadge(step: UpdateChainStep): string {
    if (step.effectId) return 'effect';
    return 'derived';
  }

  function handleRowClick(traceId: string): void {
    if (selectedId === traceId) {
      selectTrace(null);
      showStack = false;
    } else {
      selectTrace(traceId);
      showStack = false;
    }
  }

  function mutationTypeLabel(type: DomMutation['type']): string {
    if (type === 'childList') return 'children';
    if (type === 'attributes') return 'attr';
    return 'text';
  }
</script>

<!-- Header -->
<div class="header">
  <button class="clear-btn" disabled={traces.length === 0} onclick={clearTraces}> Clear </button>
  <span class="trace-count">
    {traces.length}
    {traces.length === 1 ? 'trace' : 'traces'}
  </span>
</div>

<!-- Timeline -->
{#if traces.length === 0}
  <div class="empty-state">No update traces recorded yet</div>
{:else}
  <div class="timeline">
    {#each sortedTraces as trace (trace.id)}
      {@const isSelected = selectedId === trace.id}
      <div class="trace-row" class:selected={isSelected}>
        <button class="trace-row-btn" onclick={() => handleRowClick(trace.id)}>
          <span class="chevron">{isSelected ? '\u25BE' : '\u25B8'}</span>
          <span class="time-ago">{formatTimeAgo(trace.timestamp)}</span>
          <span class="signal-label">
            {trace.rootCause.signalLabel ?? 'unnamed'}
          </span>
          {#if trace.coalescedCount}
            <span class="coalesced-badge" title="{trace.coalescedCount} writes coalesced into this trace"
              >&times;{trace.coalescedCount}</span
            >
          {/if}
          {#if trace.rootCause.componentName}
            <span class="arrow">&rarr;</span>
            <span class="component-name">{trace.rootCause.componentName}</span>
          {/if}
          <span class="chain-badge">{trace.chain.length} step{trace.chain.length !== 1 ? 's' : ''}</span>
        </button>

        <!-- Expanded detail -->
        {#if isSelected && selectedTrace}
          <div class="trace-detail">
            <!-- Root Cause -->
            <div class="detail-section">
              <div class="section-title">Root Cause</div>
              <div class="root-cause-info">
                <span class="label">Signal:</span>
                <span class="value-highlight">
                  {selectedTrace.rootCause.signalLabel ?? 'unnamed'}
                </span>
                {#if selectedTrace.rootCause.componentName}
                  <span class="component-tag">({selectedTrace.rootCause.componentName})</span>
                {/if}
                {#if selectedTrace.rootCause.oldValue != null || selectedTrace.rootCause.newValue != null}
                  <div class="value-change">
                    <span class="old-value">{formatValue(selectedTrace.rootCause.oldValue)}</span>
                    <span class="arrow">&rarr;</span>
                    <span class="new-value">{formatValue(selectedTrace.rootCause.newValue)}</span>
                  </div>
                {/if}
              </div>
              {#if selectedTrace.rootCause.stackTrace}
                <button class="stack-toggle" onclick={() => (showStack = !showStack)}>
                  {showStack ? '\u25BE' : '\u25B8'} Stack trace
                </button>
                {#if showStack}
                  <pre class="stack-trace">{selectedTrace.rootCause.stackTrace}</pre>
                {/if}
              {/if}
            </div>

            <!-- Chain -->
            {#if selectedTrace.chain.length > 0}
              <div class="detail-section">
                <div class="section-title">Chain</div>
                <div class="chain-list">
                  {#each selectedTrace.chain as step, i (i)}
                    <div class="chain-step">
                      <span class="step-arrow">&rarr;</span>
                      <span class="type-badge type-{stepTypeBadge(step)}">
                        {stepTypeBadge(step)}
                      </span>
                      <span class="step-label">
                        {step.signalLabel ?? 'unnamed'}
                      </span>
                      {#if step.newValue !== null && step.newValue !== undefined}
                        <span class="step-value">= {formatValue(step.newValue)}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- DOM Mutations -->
            {#if selectedTrace.domMutations.length > 0}
              <div class="detail-section">
                <div class="section-title">DOM Changes</div>
                <div class="mutation-list">
                  {#each selectedTrace.domMutations as mutation, i (i)}
                    <div class="mutation-row">
                      <span class="mutation-type">{mutationTypeLabel(mutation.type)}</span>
                      <span class="mutation-summary">{mutation.summary}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Header */
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--surface-raised);
    border-bottom: 1px solid var(--border-subtle);
  }

  .clear-btn {
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: var(--text-base);
    background: var(--surface-overlay);
    color: var(--text-default);
    border: 1px solid var(--border-default);
    cursor: pointer;
    font-family: inherit;
  }

  .clear-btn:hover:not(:disabled) {
    background: color-mix(in oklab, var(--surface-overlay) 90%, white);
    color: var(--text-strong);
  }

  .clear-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .trace-count {
    color: var(--text-muted);
    font-size: var(--text-sm);
    margin-left: auto;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--text-muted);
    font-size: var(--text-md);
    font-style: italic;
    padding: 32px;
  }

  /* Timeline */
  .timeline {
    overflow-y: auto;
    flex: 1;
    font-family: var(--font-mono);
    font-size: var(--text-base);
  }

  /* Trace row */
  .trace-row {
    border-bottom: 1px solid var(--border-subtle);
  }

  .trace-row.selected {
    background: var(--surface-selected);
  }

  .trace-row-btn {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-5);
    background: none;
    border: none;
    color: var(--text-default);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: var(--text-base);
    text-align: left;
  }

  .trace-row-btn:hover {
    background: var(--surface-hover);
  }

  .chevron {
    color: var(--text-muted);
    font-size: var(--text-xs);
    width: 10px;
    flex-shrink: 0;
  }

  .time-ago {
    color: var(--text-muted);
    font-size: var(--text-sm);
    min-width: 48px;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  /* Flame text uses --accent-text (legible at small sizes on any surface). */
  .signal-label {
    color: var(--accent-text);
    font-weight: 600;
  }

  .arrow {
    color: var(--text-faint);
  }

  /* Coalesced-write count: muted, like chain-badge but inline with the label. */
  .coalesced-badge {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-overlay);
    color: var(--text-muted);
    font-size: var(--text-xs);
    flex-shrink: 0;
  }

  .component-name {
    color: var(--text-strong);
  }

  .chain-badge {
    margin-left: auto;
    padding: 1px var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--surface-overlay);
    color: var(--text-muted);
    font-size: var(--text-xs);
    flex-shrink: 0;
  }

  /* Trace detail */
  .trace-detail {
    padding: var(--space-4) var(--space-4) var(--space-5) 26px;
    border-top: 1px solid var(--border-subtle);
    background: var(--surface-base);
  }

  .detail-section {
    margin-bottom: 10px;
  }

  .detail-section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: var(--space-2);
    padding-bottom: var(--space-1);
    border-bottom: 1px solid var(--border-subtle);
  }

  /* Root cause */
  .root-cause-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    color: var(--text-default);
  }

  .label {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .value-highlight {
    color: var(--accent-text);
    font-weight: 600;
  }

  .component-tag {
    color: var(--text-default);
    font-size: var(--text-sm);
  }

  .value-change {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
    font-size: var(--text-sm);
  }

  .old-value {
    color: var(--status-danger);
    text-decoration: line-through;
  }

  .new-value {
    color: var(--status-ok);
  }

  .stack-toggle {
    background: none;
    border: none;
    color: var(--val-boolean);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    padding: var(--space-1) 0;
  }

  .stack-toggle:hover {
    color: var(--text-strong);
  }

  .stack-trace {
    font-size: var(--text-xs);
    color: var(--text-muted);
    background: var(--surface-sunken);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: var(--space-2) 0 0 0;
    max-height: 150px;
    overflow-y: auto;
  }

  /* Chain */
  .chain-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) 0;
  }

  .chain-step {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-1) 0;
  }

  .step-arrow {
    color: var(--text-faint);
    font-size: var(--text-sm);
  }

  /* Step kind: a neutral chip; the derived / effect keyword carries the meaning. */
  .type-badge {
    font-size: var(--text-xs);
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    font-weight: 600;
    flex-shrink: 0;
    font-family: var(--font-mono);
    background: var(--surface-overlay);
    color: var(--text-muted);
  }

  .step-label {
    color: var(--text-default);
  }

  .step-value {
    color: var(--text-muted);
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  /* DOM Mutations */
  .mutation-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) 0;
  }

  .mutation-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-1) 0;
  }

  .mutation-type {
    font-size: var(--text-xs);
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-overlay);
    color: var(--text-muted);
    font-weight: 600;
    flex-shrink: 0;
    font-family: var(--font-mono);
  }

  .mutation-summary {
    color: var(--text-default);
    font-size: var(--text-sm);
  }
</style>
