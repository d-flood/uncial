# uncial

A block editor and SSR renderer built on Tiptap. Write a Block once, as an ordinary Svelte component; the same component renders your site and is edited in place in the WYSIWYG editor. Documents are plain ProseMirror-compatible JSON, so any backend can store them.

## Install

```sh
pnpm add uncial
```

`svelte@^5` is a peer dependency.

## Quick start

```svelte
<!-- blocks/PromoCard.svelte -->
<script module lang="ts">
	import { defineBlock } from 'uncial';

	export const block = defineBlock({
		id: 'promoCard',
		label: 'Promo card',
		attributes: { title: 'Spring launch', body: { default: '', input: 'textarea' } }
	});
</script>

<script lang="ts">
	import { Text } from 'uncial';
</script>

<article>
	<h3><Text name="title" /></h3>
	<p><Text name="body" /></p>
</article>
```

```svelte
<script lang="ts">
	import 'uncial/styles';
	import { Renderer, createContentModel } from 'uncial';
	import { Editor } from 'uncial/editor';

	const model = createContentModel({
		blocks: import.meta.glob('./blocks/*.svelte', { eager: true })
	});
	let document = $state({ type: 'doc', content: [{ type: 'paragraph' }] });
</script>

<Editor {model} bind:json={document} />
<Renderer content={document} {model} />
```

The `uncial` root is server-safe; the editor lives in `uncial/editor`. Custom elements for other frameworks are in `uncial/web-components`.

## Docs

[d-flood.github.io/uncial/docs](https://d-flood.github.io/uncial/docs/): Blocks, Page templates, Marks, rendering, styling and upgrading.
