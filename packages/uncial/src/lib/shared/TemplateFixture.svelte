<script lang="ts">
	// Test fixture: a Page template that prints the template and title it was drawn with.
	import type { Snippet } from 'svelte';
	import Text from '../render/Text.svelte';

	let { meta, body }: { meta: Record<string, unknown>; body: Snippet } = $props();
</script>

<header data-testid="template-shell">{meta.template}: <Text name="title" /></header>
{@render body()}
