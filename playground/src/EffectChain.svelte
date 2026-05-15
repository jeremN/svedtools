<script lang="ts">
  import { untrack } from 'svelte';

  let input = $state(1);
  let effectLog: string[] = $state([]);
  let processed = $state(0);
  let formatted = $derived(`Processed: ${processed}`);

  $effect(() => {
    // Reacts to input changes and writes to processed.
    // Logging is wrapped in untrack() because effectLog.push reads .length,
    // which would otherwise subscribe this effect to effectLog and form a
    // write-read cycle on .length when push bumps it.
    processed = input * 10;
    untrack(() => effectLog.push(`Effect 1: input=${input} → processed=${processed}`));
  });

  $effect(() => {
    // Reacts to formatted; logging untracked for the same reason as above.
    const value = formatted;
    untrack(() => effectLog.push(`Effect 2: formatted="${value}"`));
  });

  function increment() {
    input++;
  }

  function clearLog() {
    effectLog.length = 0;
  }
</script>

<div>
  <p>Input: {input}</p>
  <p>{formatted}</p>
  <button onclick={increment}>Increment Input</button>
  <button onclick={clearLog}>Clear Log</button>
  <h4>Effect Log:</h4>
  <ul>
    {#each effectLog as entry, i (i)}
      <li><code>{entry}</code></li>
    {/each}
  </ul>
</div>
