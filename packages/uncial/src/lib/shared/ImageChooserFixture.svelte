<script lang="ts">
	import type { ImageChooserProps } from '../core/types.js';

	let { value, choose }: ImageChooserProps = $props();
</script>

<p data-testid="chooser-value">{JSON.stringify(value)}</p>
<button type="button" onclick={() => choose({ item: 'b', page: 2 })}>Page 2 of b</button>
