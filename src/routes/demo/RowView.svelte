<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="uncial-row-items flex flex-wrap items-stretch gap-5 *:min-w-0 *:flex-1 *:basis-64">
	{@render children?.()}
</div>
