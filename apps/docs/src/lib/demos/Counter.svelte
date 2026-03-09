<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<div data-testid="counter-demo">
  <button data-testid="counter-decrement" onclick={() => count--}>-</button>
  <span data-testid="counter-value">{count}</span>
  <button data-testid="counter-increment" onclick={() => count++}>+</button>
  <p data-testid="counter-doubled">Doubled: {doubled}</p>
</div>
