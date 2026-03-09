<script lang="ts">
  let source = $state(1);
  let doubled = $derived(source * 2);
  let quadrupled = $derived(doubled * 2);
  // eslint-disable-next-line svelte/prefer-writable-derived -- intentional $effect demo for DevTools tracing
  let log = $state('');

  $effect(() => {
    log = `source=${source}, doubled=${doubled}, quadrupled=${quadrupled}`;
  });
</script>

<div data-testid="effect-chain-demo">
  <button data-testid="effect-increment" onclick={() => source++}>Increment Source</button>
  <p data-testid="effect-source">Source: {source}</p>
  <p data-testid="effect-doubled">Doubled: {doubled}</p>
  <p data-testid="effect-quadrupled">Quadrupled: {quadrupled}</p>
  <p data-testid="effect-log">Log: {log}</p>
</div>
