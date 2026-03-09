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
    gap: 8px;
    padding: 8px;
    background: #252525;
    border-bottom: 1px solid #333;
  }

  .clear-btn {
    padding: 4px 12px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
    background: #333;
    color: #888;
    border: 1px solid #555;
    cursor: pointer;
    font-family: inherit;
  }

  .clear-btn:hover:not(:disabled) {
    background: #3a3a3a;
    color: #ccc;
  }

  .clear-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .trace-count {
    color: #888;
    font-size: 11px;
    margin-left: auto;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: #666;
    font-size: 13px;
    font-style: italic;
    padding: 32px;
  }

  /* Timeline */
  .timeline {
    overflow-y: auto;
    flex: 1;
    font-family: monospace;
    font-size: 12px;
  }

  /* Trace row */
  .trace-row {
    border-bottom: 1px solid #2a2a2a;
  }

  .trace-row.selected {
    background: #2a2a2a;
  }

  .trace-row-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: none;
    border: none;
    color: #ccc;
    cursor: pointer;
    font-family: monospace;
    font-size: 12px;
    text-align: left;
  }

  .trace-row-btn:hover {
    background: #252525;
  }

  .chevron {
    color: #888;
    font-size: 10px;
    width: 10px;
    flex-shrink: 0;
  }

  .time-ago {
    color: #888;
    font-size: 11px;
    min-width: 48px;
    flex-shrink: 0;
  }

  .signal-label {
    color: #ff3e00;
    font-weight: 600;
  }

  .arrow {
    color: #555;
  }

  .component-name {
    color: #e8ab6a;
  }

  .chain-badge {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 8px;
    background: #333;
    color: #888;
    font-size: 10px;
    flex-shrink: 0;
  }

  /* Trace detail */
  .trace-detail {
    padding: 8px 10px 12px 26px;
    border-top: 1px solid #333;
    background: #1e1e1e;
  }

  .detail-section {
    margin-bottom: 10px;
  }

  .detail-section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
    margin-bottom: 4px;
    padding-bottom: 2px;
    border-bottom: 1px solid #333;
  }

  /* Root cause */
  .root-cause-info {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    color: #ccc;
  }

  .label {
    color: #888;
    font-size: 11px;
  }

  .value-highlight {
    color: #ff3e00;
    font-weight: 600;
  }

  .component-tag {
    color: #e8ab6a;
    font-size: 11px;
  }

  .value-change {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: 11px;
  }

  .old-value {
    color: #e54545;
    text-decoration: line-through;
  }

  .new-value {
    color: #4ec9b0;
  }

  .stack-toggle {
    background: none;
    border: none;
    color: #569cd6;
    cursor: pointer;
    font-family: monospace;
    font-size: 11px;
    padding: 2px 0;
  }

  .stack-toggle:hover {
    color: #7bb8e8;
  }

  .stack-trace {
    font-size: 10px;
    color: #888;
    background: #1a1a1a;
    padding: 6px 8px;
    border-radius: 3px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 4px 0 0 0;
    max-height: 150px;
    overflow-y: auto;
  }

  /* Chain */
  .chain-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 0;
  }

  .chain-step {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
  }

  .step-arrow {
    color: #555;
    font-size: 11px;
  }

  .type-badge {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .type-derived {
    background: #1e2a3a;
    color: #569cd6;
  }

  .type-effect {
    background: #1a2e2a;
    color: #4ec9b0;
  }

  .step-label {
    color: #ccc;
  }

  .step-value {
    color: #888;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  /* DOM Mutations */
  .mutation-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 0;
  }

  .mutation-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
  }

  .mutation-type {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    background: #2a2020;
    color: #ce9178;
    font-weight: 600;
    flex-shrink: 0;
  }

  .mutation-summary {
    color: #ccc;
    font-size: 11px;
  }
</style>
