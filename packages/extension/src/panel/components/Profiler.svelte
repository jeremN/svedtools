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
    if (maxTime > 16) return '#3a2020';
    if (maxTime > 8) return '#3a3520';
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
    gap: 8px;
    padding: 8px;
    background: #252525;
    border-bottom: 1px solid #333;
  }

  .record-btn {
    padding: 6px 14px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .record-btn.idle {
    background: #2d4a2d;
    color: #6abf6a;
    border: 1px solid #4a7a4a;
  }

  .record-btn.recording {
    background: #4a2020;
    color: #ff6b6b;
    border: 1px solid #7a3030;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .icon-record {
    font-size: 10px;
  }

  .icon-stop {
    font-size: 8px;
  }

  .clear-btn {
    padding: 6px 14px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
    background: #333;
    color: #888;
    border: 1px solid #555;
    cursor: pointer;
  }

  .clear-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .recording-indicator {
    color: #ff6b6b;
    font-size: 11px;
  }

  .summary {
    color: #888;
    font-size: 11px;
    margin-left: auto;
  }

  /* Section tabs */
  .section-tabs {
    display: flex;
    gap: 0;
    background: #252525;
    border-bottom: 1px solid #333;
  }

  .section-tab {
    padding: 4px 12px;
    font-size: 12px;
    color: #888;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: inherit;
  }

  .section-tab:hover {
    color: #ccc;
  }

  .section-tab.active {
    color: #ccc;
    border-bottom-color: #e8ab6a;
  }

  /* Table */
  .table-container {
    overflow-y: auto;
    flex: 1;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-family: monospace;
  }

  thead th {
    background: #252525;
    color: #888;
    font-weight: 600;
    text-align: left;
    padding: 6px 12px;
    border-bottom: 1px solid #444;
    position: sticky;
    top: 0;
  }

  tbody td {
    padding: 6px 12px;
    border-bottom: 1px solid #2a2a2a;
    color: #ccc;
  }

  .cell-name {
    color: #e8ab6a;
  }

  .cell-number {
    color: #b5cea8;
  }

  .cell-time {
    color: #b5cea8;
  }

  .unnamed {
    color: #666;
    font-style: italic;
  }

  /* Empty states */
  .overall-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: #666;
    font-size: 13px;
    font-style: italic;
  }

  .empty-state {
    color: #666;
    padding: 16px;
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
