<script lang="ts">
	import type { MarkComponentProps } from '../core/types.js';

	let { children }: MarkComponentProps = $props();
</script>

<sup>{@render children()}</sup>
