<script module lang="ts">
	import { defineBlock } from '$lib/index.js';

	export const block = defineBlock({
		id: 'row',
		label: 'Row',
		description: 'Lay out any other blocks side by side.',
		attributes: {},
		content: { kind: 'flow' }
	});
</script>

<script lang="ts">
	import type { BlockProps } from '$lib/index.js';

	let { children }: BlockProps<typeof block> = $props();
</script>

<div class="uncial-row-items flex flex-wrap items-stretch gap-5 *:min-w-0 *:flex-1 *:basis-64">
	{@render children?.()}
</div>
