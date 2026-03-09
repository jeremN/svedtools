<script lang="ts">
	import { setContext } from 'svelte';
	import ContextChild from './ContextChild.svelte';

	let theme = $state('light');

	setContext('theme', {
		get current() {
			return theme;
		},
		toggle() {
			theme = theme === 'light' ? 'dark' : 'light';
		}
	});
</script>

<div data-testid="context-demo">
	<p data-testid="context-parent-theme">Parent theme: {theme}</p>
	<button
		data-testid="context-toggle"
		onclick={() => (theme = theme === 'light' ? 'dark' : 'light')}
	>
		Toggle Theme
	</button>
	<ContextChild />
</div>
