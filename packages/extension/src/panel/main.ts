import './tokens.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { connect, onMessage, onDisconnect } from './lib/connection.svelte.js';
import { processMessage, resetState, getSelectedId } from './lib/components.svelte.js';
import { processGraphMessage, resetGraphState } from './lib/graph.svelte.js';
import { processProfilerMessage, resetProfilerState } from './lib/profiler.svelte.js';
import { processTraceMessage, resetTracerState } from './lib/tracer.svelte.js';
import { processExpansionMessage, scheduleLiveRefresh, resetExpansion } from './lib/expansion.svelte.js';

// Route incoming messages to stores
onMessage(processMessage);
onMessage(processGraphMessage);
onMessage(processProfilerMessage);
onMessage(processTraceMessage);
onMessage(processExpansionMessage);

// Live drill-down: when the inspected component or the graph changes, debounce a
// refresh of the selected component snapshot + all open sub-trees.
onMessage((m) => {
  if (
    (m.type === 'component:updated' && m.id === getSelectedId()) ||
    m.type === 'graph:update' ||
    m.type === 'graph:snapshot'
  ) {
    scheduleLiveRefresh(getSelectedId());
  }
});

// Reset state on disconnect (prevents stale data on reconnect)
onDisconnect(resetState);
onDisconnect(resetGraphState);
onDisconnect(resetProfilerState);
onDisconnect(resetTracerState);
onDisconnect(resetExpansion);

// Establish port connection to service worker
connect();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
