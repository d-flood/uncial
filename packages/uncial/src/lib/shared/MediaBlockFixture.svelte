<script lang="ts">
	// Test fixture: a block that prints the media values it is handed and draws its image Field.
	import { getBlock } from '../runtime/blockContext.js';
	import Image from '../render/Image.svelte';

	let { image, cover, download, gallery }: Record<string, unknown> = $props();

	const block = getBlock();
</script>

<output data-testid="media-props">{JSON.stringify({ image, cover, download, gallery })}</output>
<Image name="image" sizes="50vw" data-testid="media-srcset" />
<Image name="image" crop="square" data-testid="media-crop" />
<button
	type="button"
	data-testid="media-update"
	onclick={() => block.update({ image: '/x/b.png' })}
>
	Update
</button>
