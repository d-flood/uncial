<script lang="ts">
	import { embedPlayerSrc } from './embedPlayer.js';
	import { sanitizeHref } from './sanitize.js';

	interface Props {
		url?: string;
		title?: string;
	}

	let { url = '', title = '' }: Props = $props();

	const player = $derived(embedPlayerSrc(url));
	const href = $derived(sanitizeHref(url));
</script>

{#if player}
	<iframe
		class="uncial-embed"
		src={player}
		title={title || 'Embedded video'}
		allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
		allowfullscreen
		loading="lazy"
	></iframe>
{:else if href}
	<p class="uncial-embed-link">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an embed points off-site -->
		<a {href}>{title || url}</a>
	</p>
{/if}

<style>
	.uncial-embed {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 0;
	}
</style>
