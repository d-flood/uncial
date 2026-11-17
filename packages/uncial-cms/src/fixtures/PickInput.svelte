<script lang="ts">
	import type { AttributeInputProps } from 'uncial';

	let { name, value, update }: AttributeInputProps = $props();
</script>

<button type="button" aria-label="Pick {name}" onclick={() => update('picked')}>
	{value || 'Pick'}
</button>
