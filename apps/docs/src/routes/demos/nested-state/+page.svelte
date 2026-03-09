<script lang="ts">
  import NestedState from '$lib/demos/NestedState.svelte';
</script>

<h1>Nested State Demo</h1>
<p>
  Demonstrates deep reactive objects with <code>$state</code>. Open DevTools to observe how nested property mutations
  are tracked and how the component tree reflects deep state changes.
</p>

<NestedState />
