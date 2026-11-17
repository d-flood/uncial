<script lang="ts">
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

<Renderer {model} {content} />
