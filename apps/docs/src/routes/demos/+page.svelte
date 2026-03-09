<script lang="ts">
	import { resolve } from '$app/paths';

	const demos = [
		{
			href: '/demos/counter',
			title: 'Counter',
			description: 'Basic $state and $derived reactivity with increment/decrement controls.'
		},
		{
			href: '/demos/nested-state',
			title: 'Nested State',
			description: 'Deep reactive objects showing how nested property mutations are tracked.'
		},
		{
			href: '/demos/effect-chain',
			title: 'Effect Chain',
			description:
				'A $state to $derived to $effect chain demonstrating cascading reactivity updates.'
		},
		{
			href: '/demos/todo-list',
			title: 'Todo List',
			description: 'Array mutations with keyed {#each} blocks for fine-grained list reactivity.'
		},
		{
			href: '/demos/context',
			title: 'Context',
			description:
				'setContext/getContext with reactive state shared between parent and child components.'
		}
	];
</script>

<div class="demos-index">
	<h1>Demos</h1>
	<p class="lead">
		Interactive demos showcasing Svelte 5 reactivity patterns. Open the DevTools panel alongside
		each demo to inspect state, derived values, effects, and component context in real time.
	</p>

	<ul class="demo-list">
		{#each demos as demo (demo.href)}
			<li>
				<a href={resolve(demo.href)}>
					<strong>{demo.title}</strong>
					<span>{demo.description}</span>
				</a>
			</li>
		{/each}
	</ul>
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
		margin-bottom: 1.5rem;
	}

	.demo-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.demo-list a {
		display: block;
		padding: 1rem 1.25rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}

	.demo-list a:hover {
		border-color: var(--accent);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
		text-decoration: none;
	}

	.demo-list strong {
		display: block;
		font-size: 1.05rem;
		margin-bottom: 0.25rem;
		color: var(--accent);
	}

	.demo-list span {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
</style>
