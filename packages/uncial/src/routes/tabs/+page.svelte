<script lang="ts">
	import { resolve } from '$app/paths';
	import { createContentModel, Renderer } from '$lib/index.js';
	import * as tab from '$lib/render/Tab.svelte';
	import * as tabs from '$lib/render/Tabs.svelte';

	const model = createContentModel({ blocks: { tabs, tab } });
	const content = {
		type: 'doc',
		content: [
			{
				type: 'tabs',
				attrs: { group: 'framework' },
				content: [
					{
						type: 'tab',
						attrs: { label: 'React' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'React setup' }] }]
					},
					{
						type: 'tab',
						attrs: { label: 'Vue' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Vue setup' }] }]
					}
				]
			},
			{
				type: 'tabs',
				attrs: { group: 'package-manager' },
				content: [
					{
						type: 'tab',
						attrs: { label: 'npm' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'npm install' }] }]
					},
					{
						type: 'tab',
						attrs: { label: 'pnpm' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'pnpm add' }] }]
					}
				]
			}
		]
	};
</script>

<Renderer {model} {content} />

<a href={resolve('/tabs/next')}>Next tab page</a>
