<script lang="ts">
	const diagram = `
  +------------------+      +------------------+      +------------------+
  |   Vite Plugin    |      |   Page Bridge    |      |  Content Script  |
  |                  |      |                  |      |                  |
  | AST transforms   |----->| Collects events  |----->| Relays messages  |
  | at compile time  |      | window.postMsg   |      | chrome.runtime   |
  +------------------+      +------------------+      +--------+---------+
                                                               |
                                                               v
  +------------------+      +------------------+      +------------------+
  |   DevTools Panel |      | Service Worker   |      |                  |
  |                  |<-----|                  |<-----|                  |
  | Svelte UI:       |      | Routes messages  |      |                  |
  | Components, etc. |      | to correct panel |      |                  |
  +------------------+      +------------------+      +------------------+`;

	const messageTypes = `// packages/shared/src/protocol.ts (simplified)
type MessageType =
  | 'component:mount'      // Component added to tree
  | 'component:unmount'    // Component removed
  | 'component:update'     // Props or state changed
  | 'state:set'            // $.set() called
  | 'state:update'         // $.update() called
  | 'profile:start'        // Profiling session started
  | 'profile:end'          // Profiling session ended
  | 'trace:capture';       // Update trace recorded`;
</script>

<article class="doc">
	<h1>Architecture</h1>
	<p class="lead">
		How compile-time instrumentation flows from the Vite plugin through the Chrome extension to
		the DevTools panel.
	</p>

	<section>
		<h2>System Overview</h2>
		<pre class="diagram"><code>{diagram}</code></pre>
	</section>

	<section>
		<h2>Data Flow</h2>
		<p>
			Data flows in one direction, from the instrumented application to the DevTools panel:
		</p>
		<ol>
			<li>
				<strong>Compile time</strong> &mdash; The Vite plugin transforms Svelte's compiled JavaScript
				output. It injects calls to <code>$.push</code>, <code>$.pop</code>,
				<code>$.set</code>, and <code>$.update</code> that emit instrumentation events.
			</li>
			<li>
				<strong>Page bridge</strong> &mdash; A small script injected into the page listens for these
				events. It serializes component data (props, state, file locations) using the shared
				wire protocol and posts it via <code>window.postMessage</code>.
			</li>
			<li>
				<strong>Content script</strong> &mdash; A Chrome extension content script running in the
				page context picks up these messages and forwards them to the service worker using
				<code>chrome.runtime.sendMessage</code>.
			</li>
			<li>
				<strong>Service worker</strong> &mdash; The background service worker maintains connections
				to all open DevTools panel instances. It routes incoming messages to the correct
				panel based on the tab ID.
			</li>
			<li>
				<strong>DevTools panel</strong> &mdash; The Svelte-powered panel UI receives the messages,
				updates its internal state, and renders the component tree, reactivity graph,
				profiler, and update tracer.
			</li>
		</ol>
	</section>

	<section>
		<h2>Key Concepts</h2>

		<h3>Compile-Time Instrumentation</h3>
		<p>
			Unlike runtime-based DevTools that monkey-patch framework internals, this approach
			modifies the compiled output at build time. This means:
		</p>
		<ul>
			<li>No runtime performance cost when DevTools is disconnected.</li>
			<li>Precise source locations from the original <code>.svelte</code> files.</li>
			<li>Full compatibility with Svelte 5's runes and signals system.</li>
		</ul>

		<h3>Wire Protocol</h3>
		<p>
			All messages between the page and the extension use a typed protocol defined in
			<code>packages/shared</code>. This ensures type safety across the Chrome extension
			boundary (page, content script, service worker, panel).
		</p>
		<pre><code>{messageTypes}</code></pre>

		<h3>Serialization</h3>
		<p>
			Component state can contain complex objects, circular references, and non-serializable
			values (functions, symbols). The wire protocol handles this by:
		</p>
		<ul>
			<li>Truncating deeply nested objects beyond a configurable depth limit.</li>
			<li>Replacing functions and symbols with descriptive placeholder strings.</li>
			<li>Detecting and breaking circular references.</li>
			<li>Keeping payloads small for fast message passing.</li>
		</ul>
	</section>

	<section>
		<h2>Project Structure</h2>
		<pre><code>svedtools/
  packages/
    vite-plugin/    # Vite plugin (AST transforms + bridge injection)
    extension/      # Chrome extension (content script, service worker, panel)
    shared/         # Wire protocol types and serialization utilities
  apps/
    docs/           # This documentation site (SvelteKit + static adapter)</code></pre>
	</section>
</article>

<style>
	.doc {
		max-width: 42rem;
	}

	h1 {
		font-size: 1.75rem;
		margin-bottom: 0.5rem;
	}

	.lead {
		color: var(--text-muted);
		font-size: 1.05rem;
		margin-bottom: 2rem;
	}

	section {
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1.25rem;
		margin-bottom: 0.75rem;
	}

	h3 {
		font-size: 1.05rem;
		margin-top: 1.25rem;
		margin-bottom: 0.5rem;
	}

	p {
		margin-bottom: 0.75rem;
	}

	pre {
		background: var(--code-bg);
		color: var(--code-text);
		padding: 1rem;
		border-radius: 8px;
		overflow-x: auto;
		font-size: 0.85rem;
		line-height: 1.5;
		margin-bottom: 0.75rem;
	}

	pre.diagram {
		font-size: 0.75rem;
		line-height: 1.4;
	}

	code {
		font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace;
		font-size: 0.88em;
	}

	:global(.doc p > code),
	:global(.doc li > code) {
		background: #eee;
		padding: 0.15em 0.4em;
		border-radius: 3px;
	}

	ol,
	ul {
		padding-left: 1.5rem;
		margin-bottom: 0.75rem;
	}

	li {
		margin-bottom: 0.5rem;
	}
</style>
