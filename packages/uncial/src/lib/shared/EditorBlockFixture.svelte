<script lang="ts">
	// Test fixture: a block that edits its title in place and prints its Block context.
	import { getContext, type Snippet } from 'svelte';
	import { getBlock } from '../runtime/blockContext.js';
	import Text from '../render/Text.svelte';

	interface Props {
		title?: string;
		children?: Snippet;
	}

	let { title = '', children }: Props = $props();

	const block = getBlock<{ title: string }>();
	const app = getContext<string | undefined>('fixture-app');
</script>

<div data-testid="editor-block-fixture">
	<input
		data-testid="title-input"
		value={title}
		oninput={(event) => block.update({ title: event.currentTarget.value })}
	/>
	<p data-testid="fixture-title"><Text name="title" /></p>
	<output data-testid="fixture-context"
		>{JSON.stringify({
			type: block.type,
			attrs: block.attrs,
			editing: block.editing,
			parent: block.parent,
			index: block.index,
			siblings: block.siblings,
			page: block.page,
			app
		})}</output
	>
	{#if children}
		<div data-testid="fixture-children">{@render children()}</div>
	{/if}
</div>
