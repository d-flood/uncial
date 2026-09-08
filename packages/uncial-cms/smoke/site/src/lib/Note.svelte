<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<aside>
	<strong>Note</strong>
	{#if children}{@render children()}{/if}
</aside>
