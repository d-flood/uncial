<script lang="ts">
	import { Page, type ContentDocument } from 'uncial';
	import type { Site } from '../define-site.js';

	interface Props {
		site: Site;
		/** The content route's data; everything beyond `document`, `meta` and `path` reaches the Page template. */
		data: { document: ContentDocument; meta?: unknown; path?: string } & Record<string, unknown>;
	}

	let { site, data }: Props = $props();

	const routeData = $derived.by(() => {
		const { document: _document, meta: _meta, path: _path, ...rest } = data;
		return rest;
	});
</script>

<Page model={site} document={data.document} path={data.path} data={routeData} />
