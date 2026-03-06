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

<section class="card-group-edit">
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
	.card-group-edit {
		border: 1px dashed #c9d3ea;
		border-radius: 14px;
		padding: 0.75rem;
		background: #fcfcff;
	}

	h3 {
		margin: 0 0 0.6rem;
		font-size: 0.98rem;
	}

	.card-group-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.group-card {
		flex: 1 1 170px;
		min-width: 0;
		padding: 0.55rem 0.6rem;
		border-radius: 10px;
		background: #fff;
		border: 1px solid #dce3f2;
	}

	h4 {
		margin: 0;
		font-size: 0.88rem;
	}

	p {
		margin: 0.3rem 0 0;
		font-size: 0.82rem;
		color: #5c6a82;
	}
</style>
