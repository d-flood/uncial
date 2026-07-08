<script lang="ts">
	// Test fixture: a custom block editor component with an attribute-bound input.
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		children?: Snippet;
		updateAttributes?: (attrs: Record<string, unknown>) => void;
	}

	let { title = '', children, updateAttributes }: Props = $props();
</script>

<div data-testid="editor-block-fixture">
	<input
		data-testid="title-input"
		value={title}
		oninput={(event) => updateAttributes?.({ title: event.currentTarget.value })}
	/>
	<p data-testid="fixture-title">{title}</p>
	{#if children}
		<div data-testid="fixture-children">{@render children()}</div>
	{/if}
</div>
