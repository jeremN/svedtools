import { mount } from 'svelte';
import App from './App.svelte';
import { connect, onMessage, onDisconnect } from './lib/connection.svelte.js';
import { processMessage, resetState } from './lib/components.svelte.js';
import { processGraphMessage, resetGraphState } from './lib/graph.svelte.js';

// Route incoming messages to stores
onMessage(processMessage);
onMessage(processGraphMessage);

// Reset state on disconnect (prevents stale data on reconnect)
onDisconnect(resetState);
onDisconnect(resetGraphState);

// Establish port connection to service worker
connect();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
