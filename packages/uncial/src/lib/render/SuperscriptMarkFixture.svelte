<script lang="ts">
	import type { MarkComponentProps } from '../core/types.js';

	let { children }: Pick<MarkComponentProps, 'children'> = $props();
</script>

<sup>{@render children()}</sup>
