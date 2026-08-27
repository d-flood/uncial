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
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'React follow-up' }] }]
					},
					{
						type: 'tab',
						attrs: { label: 'Vue' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Vue follow-up' }] }]
					}
				]
			}
		]
	};
</script>

<Renderer {blocks} {content} />
