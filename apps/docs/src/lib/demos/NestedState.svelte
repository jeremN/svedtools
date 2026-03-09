<script lang="ts">
	let user = $state({
		name: 'Alice',
		address: {
			city: 'Paris',
			country: 'France'
		}
	});
</script>

<div data-testid="nested-state-demo">
	<input data-testid="nested-name-input" bind:value={user.name} />
	<input data-testid="nested-city-input" bind:value={user.address.city} />
	<p data-testid="nested-display">
		{user.name} lives in {user.address.city}, {user.address.country}
	</p>
</div>
