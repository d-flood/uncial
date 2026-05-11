<script lang="ts">
	import type { PMNode } from '../shared/document.js';
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		content?: PMNode[];
		children?: Snippet;
	}

	let { title = '', content = [], children }: Props = $props();
</script>

<section data-testid="container-block">
	<h2>{title}</h2>
	<p data-testid="child-count">{content.length}</p>
	<div data-testid="container-children">
		{#if children}
			{@render children()}
		{/if}
	</div>
</section>
