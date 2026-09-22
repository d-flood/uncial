<script lang="ts" module>
	export type UpdateAttributes = (attrs: Record<string, unknown>) => void;

	// Lets a test reach one block instance's `updateAttributes` prop directly,
	// keyed by that instance's root element, without going through a control
	// whose own focus or selection side effects would confuse the assertion.
	export const fixtureUpdateAttributes = new WeakMap<Element, UpdateAttributes>();
</script>

<script lang="ts">
	// Test fixture: a custom block editor component with an attribute-bound input.
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		children?: Snippet;
		updateAttributes?: UpdateAttributes;
	}

	let { title = '', children, updateAttributes }: Props = $props();
</script>

<div
	data-testid="editor-block-fixture"
	{@attach (node) => {
		if (updateAttributes) fixtureUpdateAttributes.set(node, updateAttributes);
	}}
>
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
