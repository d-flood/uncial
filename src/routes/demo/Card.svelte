<script lang="ts">
	export let title = '';
	export let subtitle = '';
	export let body = '';
</script>

<article class="card-view">
	<h3>{title}</h3>
	{#if subtitle}
		<p class="subtitle">{subtitle}</p>
	{/if}
	<p class="body">{body}</p>
</article>

<style>
	.card-view {
		border: 1px solid #e2d8ca;
		border-radius: 12px;
		padding: 0.95rem 1rem;
		background: linear-gradient(180deg, #fffdfa 0%, #fff5e7 100%);
		box-shadow: 0 12px 24px -24px rgb(64 41 12 / 75%);
	}

	h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.subtitle {
		margin: 0.25rem 0 0.5rem;
		color: #695033;
		font-size: 0.92rem;
	}

	.body {
		margin: 0;
		color: #392817;
		line-height: 1.4;
	}
</style>
