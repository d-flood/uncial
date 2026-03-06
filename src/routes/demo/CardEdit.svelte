<script lang="ts">
	export let title = '';
	export let subtitle = '';
	export let body = '';
</script>

<article class="card-edit">
	<h3>{title || 'Untitled'}</h3>
	{#if subtitle}
		<p class="subtitle">{subtitle}</p>
	{/if}
	<p class="body">{body || 'No body content.'}</p>
</article>

<style>
	.card-edit {
		border: 1px dashed #d9cdbb;
		border-radius: 12px;
		padding: 0.72rem 0.8rem;
		background: #fffcf6;
	}

	h3 {
		margin: 0;
		font-size: 1rem;
	}

	.subtitle {
		margin: 0.2rem 0 0.45rem;
		color: #745737;
		font-size: 0.9rem;
	}

	.body {
		margin: 0;
		font-size: 0.92rem;
		color: #4d351a;
	}
</style>
