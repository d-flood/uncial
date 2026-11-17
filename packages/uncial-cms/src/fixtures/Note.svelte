<script module lang="ts">
	import { defineBlock } from 'uncial';

	export const block = defineBlock({ id: 'note', label: 'Note', attributes: { text: '' } });
</script>

<script lang="ts">
	import type { BlockProps } from 'uncial';

	let { text }: BlockProps<typeof block> = $props();
</script>

<aside>{text}</aside>
