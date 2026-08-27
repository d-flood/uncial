<script lang="ts">
	import { createBlockRegistry } from '$lib/core/index.js';
	import { Renderer } from '$lib/render/index.js';
	import { tabBlock, tabsBlock } from '$lib/tabs.js';

	const blocks = createBlockRegistry([tabsBlock, tabBlock]);
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

<Renderer {blocks} {content} />

<a href="/tabs/next/">Next tab page</a>
