<script lang="ts">
	let { src = '' }: { src?: string } = $props();
</script>

{#if src}<img {src} alt="" />{/if}
