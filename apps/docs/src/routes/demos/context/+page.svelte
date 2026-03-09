<script lang="ts">
	import ContextParent from '$lib/demos/ContextParent.svelte';
</script>

<h1>Context Demo</h1>
<p>
	Demonstrates <code>setContext</code> and <code>getContext</code> with reactive state. Open
	DevTools to inspect context values shared between parent and child components and how changes
	propagate through the component tree.
</p>

<ContextParent />
