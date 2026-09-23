<script lang="ts">
	import { defineSite } from 'uncial-cms';
	import { EditorSurface } from 'uncial-cms/astro/editor';
	import { blocks, schema } from './site.ts';
	import { siteOptions } from './site-options.ts';

	let { sourcePath, pagePath }: { sourcePath: string; pagePath: string } = $props();
</script>

<EditorSurface site={defineSite(siteOptions)} {blocks} {schema} {sourcePath} {pagePath} />
