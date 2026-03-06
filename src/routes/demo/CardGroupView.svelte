<script lang="ts">
	export let title = '';
	export let cards = '';

	$: items = String(cards)
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [cardTitle, cardBody = ''] = line.split('|');
			return {
				title: cardTitle.trim(),
				body: cardBody.trim()
			};
		});
</script>

<section class="card-group-view">
	<h3>{title || 'Card Group'}</h3>
	<div class="card-group-grid">
		{#each items as item, index (`${item.title}-${index}`)}
			<article class="group-card">
				<h4>{item.title || 'Untitled'}</h4>
				{#if item.body}
					<p>{item.body}</p>
				{/if}
			</article>
		{/each}
	</div>
</section>

<style>
	.card-group-view {
		border: 1px solid #d8deeb;
		border-radius: 14px;
		padding: 0.95rem;
		background: linear-gradient(180deg, #fcfdff 0%, #f6f9ff 100%);
	}

	h3 {
		margin: 0 0 0.7rem;
		font-size: 1.02rem;
	}

	.card-group-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
	}

	.group-card {
		flex: 1 1 210px;
		min-width: 0;
		padding: 0.65rem 0.7rem;
		border-radius: 12px;
		background: #fff;
		border: 1px solid #dde6f8;
	}

	h4 {
		margin: 0;
		font-size: 0.92rem;
	}

	p {
		margin: 0.35rem 0 0;
		color: #4f5f7a;
		font-size: 0.86rem;
		line-height: 1.35;
	}
</style>
