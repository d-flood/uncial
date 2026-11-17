<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import type { Site } from '../define-site.js';
	import type { DashboardProps } from '../dashboard/types.js';

	type Props = Omit<DashboardProps, 'site'> & {
		site: Site;
		/** Light-DOM content for the custom element, such as an App section's `slot="id"` element. */
		children?: Snippet;
	};

	let { site, children, ...options }: Props = $props();
	let mounted = $state(false);

	onMount(() => {
		// The same statically decidable gate `EditorPage` uses: a local-only
		// production build reaches no CMS runtime at all.
		if (!import.meta.env.DEV && import.meta.env.UNCIAL_CMS_FORGE === 'none') return;
		void import('../dashboard/element.js').then(() => (mounted = true));
	});
</script>

{#if mounted}
	<!-- A spread would lowercase camelCase options into attributes; assign them as properties. -->
	<uncial-dashboard {@attach (element: HTMLElement) => void Object.assign(element, { site, ...options })}>
		{@render children?.()}
	</uncial-dashboard>
{/if}
