<script lang="ts">
	import type { MarkComponentProps } from '../core/types.js';

	let { children }: Pick<MarkComponentProps, 'children'> = $props();
</script>

<span data-small-caps>{@render children()}</span>
