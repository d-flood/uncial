<script lang="ts">
	import type { MarkComponentProps } from 'uncial';

	let { children }: MarkComponentProps = $props();
</script>

<span data-small-caps style="font-variant: small-caps">{@render children()}</span>
