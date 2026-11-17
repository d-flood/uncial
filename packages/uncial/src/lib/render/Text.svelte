<script lang="ts">
	import { useField } from '../runtime/fields.js';

	let { name }: { name: string } = $props();

	const field = useField(() => name);
	const scope = $derived(field.scope);
	const Editing = $derived(scope && field.editors?.text);
	const text = $derived.by(() => {
		const value = scope?.value(name);
		return typeof value === 'string' ? value : value == null ? '' : String(value);
	});
</script>

{#if scope && Editing}
	<Editing {scope} {name} />
{:else if scope}
	{text}
{/if}
