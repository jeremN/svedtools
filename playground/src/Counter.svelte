<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
  let quadrupled = $derived(doubled * 2);
</script>

<div>
  <button onclick={() => count--}>-</button>
  <span>{count}</span>
  <button onclick={() => count++}>+</button>
  <p>Doubled: {doubled}, Quadrupled: {quadrupled}</p>
</div>
