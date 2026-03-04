import { mount } from 'svelte';
import App from './App.svelte';
import { connect, onMessage, onDisconnect } from './lib/connection.svelte.js';
import { processMessage, resetState } from './lib/components.svelte.js';
import { processGraphMessage, resetGraphState } from './lib/graph.svelte.js';
import { processProfilerMessage, resetProfilerState } from './lib/profiler.svelte.js';

// Route incoming messages to stores
onMessage(processMessage);
onMessage(processGraphMessage);
onMessage(processProfilerMessage);

// Reset state on disconnect (prevents stale data on reconnect)
onDisconnect(resetState);
onDisconnect(resetGraphState);
onDisconnect(resetProfilerState);

// Establish port connection to service worker
connect();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
