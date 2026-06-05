<script lang="ts">
  let user = $state({
    name: 'Ada',
    address: { city: 'London', geo: { lat: 51.5, lng: -0.1 } },
    tags: ['admin', 'beta'],
  });
  let scores = $state(
    new Map<string, number>([
      ['math', 90],
      ['art', 75],
    ]),
  );

  function mutate() {
    user.address.geo.lat = Math.round((user.address.geo.lat + 0.1) * 10) / 10;
    scores.set('math', (scores.get('math') ?? 0) + 1);
  }
</script>

<section>
  <h2>Nested state</h2>
  <button onclick={mutate}>Mutate nested</button>
  <pre>{JSON.stringify(user)}</pre>
</section>
