<script lang="ts">
	import Counter from '$lib/demos/Counter.svelte';
</script>

<h1>Counter Demo</h1>
<p>
	Demonstrates <code>$state</code> and <code>$derived</code> reactivity. Open DevTools to inspect
	state values and see how derived values update automatically when the count changes.
</p>

<Counter />
