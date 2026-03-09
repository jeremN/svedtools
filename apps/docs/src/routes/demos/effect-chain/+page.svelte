<script lang="ts">
  import EffectChain from '$lib/demos/EffectChain.svelte';
</script>

<h1>Effect Chain Demo</h1>
<p>
  Demonstrates a <code>$state</code> to <code>$derived</code> to <code>$effect</code> chain. Open DevTools to trace the reactivity
  graph and see how a single state change cascades through derived values and triggers effects.
</p>

<EffectChain />
