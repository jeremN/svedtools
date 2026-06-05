<script lang="ts">
  import {
    getIsRecording,
    getRecordingStartTime,
    getComponentStats,
    getEffectStats,
    getRenderTimings,
    getEffectTimings,
    startRecording,
    stopRecording,
    clearData,
  } from '../lib/profiler.svelte.js';
  let isRecording = $derived(getIsRecording());
  let recordingStartTime = $derived(getRecordingStartTime());
  let componentStats = $derived(getComponentStats());
  let effectStats = $derived(getEffectStats());
  let renderTimings = $derived(getRenderTimings());
  let effectTimings = $derived(getEffectTimings());
  let hasData = $derived(renderTimings.length > 0 || effectTimings.length > 0);

  let activeSection: 'components' | 'effects' = $state('components');

  let elapsed: number = $state(0);

  $effect(() => {
    if (!isRecording || !recordingStartTime) {
      elapsed = 0;
      return;
    }
    const interval = setInterval(() => {
      elapsed = Date.now() - recordingStartTime!;
    }, 100);
    return () => clearInterval(interval);
  });

  function rowBackground(maxTime: number): string {
    if (maxTime > 16) return 'var(--heat-danger-bg)';
    if (maxTime > 8) return 'var(--heat-warn-bg)';
    return 'transparent';
  }
</script>

<!-- Toolbar -->
<div class="toolbar">
  {#if isRecording}
    <button class="record-btn recording" onclick={stopRecording}>
      <span class="icon-stop">&#9632;</span> Stop
    </button>
  {:else}
    <button class="record-btn idle" onclick={startRecording}>
      <span class="icon-record">&#9679;</span> Record
    </button>
  {/if}

  <button class="clear-btn" disabled={isRecording || !hasData} onclick={clearData}> Clear </button>

  {#if isRecording}
    <span class="recording-indicator">
      Recording {(elapsed / 1000).toFixed(1)}s
    </span>
  {/if}

  <span class="summary">
    {renderTimings.length} renders, {effectTimings.length} effects
  </span>
</div>

<!-- Section tabs -->
<div class="section-tabs">
  <button
    class="section-tab"
    class:active={activeSection === 'components'}
    onclick={() => (activeSection = 'components')}
  >
    Components
  </button>
  <button class="section-tab" class:active={activeSection === 'effects'} onclick={() => (activeSection = 'effects')}>
    Effects
  </button>
</div>

<!-- Content -->
{#if !hasData && !isRecording}
  <div class="overall-empty">Click Record to start profiling</div>
{:else if activeSection === 'components'}
  {#if componentStats.length === 0}
    <div class="empty-state">No render data recorded</div>
  {:else}
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>Renders</th>
            <th>Total &#9660;</th>
            <th>Avg</th>
            <th>Max</th>
          </tr>
        </thead>
        <tbody>
          {#each componentStats as stat (stat.name)}
            <tr style="background: {rowBackground(stat.maxTime)}">
              <td class="cell-name">{stat.name}</td>
              <td class="cell-number">{stat.renderCount}</td>
              <td class="cell-time">{stat.totalTime.toFixed(2)}ms</td>
              <td class="cell-time">{stat.avgTime.toFixed(2)}ms</td>
              <td class="cell-time">{stat.maxTime.toFixed(2)}ms</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{:else if activeSection === 'effects'}
  {#if effectStats.length === 0}
    <div class="empty-state">No effect data recorded</div>
  {:else}
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Effect</th>
            <th>Executions</th>
            <th>Total</th>
            <th>Avg</th>
          </tr>
        </thead>
        <tbody>
          {#each effectStats as stat (stat.effectId)}
            <tr>
              <td class="cell-name">
                {#if stat.label}
                  {stat.label}
                {:else}
                  <em class="unnamed">unnamed</em>
                {/if}
              </td>
              <td class="cell-number">{stat.execCount}</td>
              <td class="cell-time">{stat.totalDuration.toFixed(2)}ms</td>
              <td class="cell-time">{stat.avgDuration.toFixed(2)}ms</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  /* Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--surface-raised);
    border-bottom: 1px solid var(--border-subtle);
  }

  .record-btn {
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: var(--text-base);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .record-btn.idle {
    background: color-mix(in oklab, var(--status-ok) 15%, var(--surface-raised));
    color: var(--status-ok);
    border: 1px solid color-mix(in oklab, var(--status-ok) 38%, transparent);
  }

  .record-btn.recording {
    background: color-mix(in oklab, var(--status-danger) 16%, var(--surface-raised));
    color: var(--heat-danger-fg);
    border: 1px solid color-mix(in oklab, var(--status-danger) 40%, transparent);
    animation: pulse 1.5s var(--ease-out) infinite;
  }

  .icon-record {
    font-size: var(--text-xs);
  }

  .icon-stop {
    font-size: 8px;
  }

  .clear-btn {
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: var(--text-base);
    background: var(--surface-overlay);
    color: var(--text-default);
    border: 1px solid var(--border-default);
    cursor: pointer;
  }

  .clear-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .recording-indicator {
    color: var(--heat-danger-fg);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .summary {
    color: var(--text-muted);
    font-size: var(--text-sm);
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }

  /* Section tabs */
  .section-tabs {
    display: flex;
    gap: 0;
    background: var(--surface-raised);
    border-bottom: 1px solid var(--border-subtle);
  }

  .section-tab {
    padding: var(--space-2) var(--space-5);
    font-size: var(--text-base);
    color: var(--text-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: inherit;
    transition:
      color var(--dur-fast) var(--ease-out),
      border-color var(--dur-fast) var(--ease-out);
  }

  .section-tab:hover {
    color: var(--text-default);
  }

  .section-tab.active {
    color: var(--text-strong);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }

  /* Table */
  .table-container {
    overflow-y: auto;
    flex: 1;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-base);
    font-family: var(--font-mono);
  }

  thead th {
    background: var(--surface-raised);
    color: var(--text-muted);
    font-weight: 600;
    text-align: left;
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border-default);
    position: sticky;
    top: 0;
  }

  tbody td {
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-default);
  }

  .cell-name {
    color: var(--text-strong);
  }

  .cell-number,
  .cell-time {
    color: var(--val-number);
    font-variant-numeric: tabular-nums;
  }

  .unnamed {
    color: var(--text-faint);
    font-style: italic;
  }

  /* Empty states */
  .overall-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--text-muted);
    font-size: var(--text-md);
    font-style: italic;
  }

  .empty-state {
    color: var(--text-muted);
    padding: var(--space-6);
    text-align: center;
    font-style: italic;
  }

  /* Animations */
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }
</style>
