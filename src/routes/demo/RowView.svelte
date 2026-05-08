<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="uncial-row-items">
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.uncial-row-items {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.uncial-row-items > :global(*) {
		flex: 1 1 16rem;
		min-width: 0;
	}
</style>
