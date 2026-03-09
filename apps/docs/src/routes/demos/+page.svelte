<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<div class="demos-index">
	<h1>Demos</h1>
	<p class="lead">Interactive demos coming soon.</p>
	<p>
		The demo pages will showcase the DevTools plugin with live Svelte 5 components. Check back
		after <a href={resolve('/docs/installation')}>installing the plugin</a>.
	</p>
</div>

<style>
	.demos-index {
		max-width: 40rem;
	}

	h1 {
		font-size: 1.75rem;
		margin-bottom: 0.5rem;
	}

	.lead {
		color: var(--text-muted);
		font-size: 1.05rem;
		margin-bottom: 1rem;
	}

	p {
		margin-bottom: 0.75rem;
	}
</style>
