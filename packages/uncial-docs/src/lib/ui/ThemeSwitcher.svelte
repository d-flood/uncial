<script lang="ts">
	import SunIcon from 'phosphor-svelte/lib/SunIcon';
	import MoonIcon from 'phosphor-svelte/lib/MoonIcon';
	import MonitorIcon from 'phosphor-svelte/lib/MonitorIcon';
	import { theme } from '$lib/ui/theme.svelte.js';

	$effect(() => {
		theme.init();
	});

	const labels: Record<typeof theme.mode, string> = {
		system: 'System theme (auto)',
		light: 'Light theme',
		dark: 'Dark theme'
	};
</script>

<button
	type="button"
	class="btn btn-ghost btn-sm btn-square"
	onclick={() => theme.cycle()}
	aria-label={labels[theme.mode]}
	title={labels[theme.mode]}
>
	{#if theme.mode === 'light'}
		<SunIcon size={18} weight="bold" />
	{:else if theme.mode === 'dark'}
		<MoonIcon size={18} weight="bold" />
	{:else}
		<MonitorIcon size={18} weight="bold" />
	{/if}
</button>
