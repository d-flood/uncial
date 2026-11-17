# Uncial

[Demo](https://d-flood.github.io/uncial/) | [Docs](https://d-flood.github.io/uncial/docs/) | [GitHub](https://github.com/d-flood/uncial)

Uncial is a block editor and SSR renderer built on Tiptap. You write a Block once, as an ordinary Svelte component, and the same component renders your site and is edited in place in a WYSIWYG editor. Documents are plain ProseMirror-compatible JSON.

![screenshot of the Uncial richtext and block editor with a callout component selected](.github/images/basic%20editor.png)

## Packages

- **[`uncial`](packages/uncial)**: the editor, renderer and Content model, for any backend.
- **[`uncial-cms`](packages/uncial-cms)**: a git-backed CMS on top of it. Every page gets an Editor variant, and a save is a commit.
- **[`uncial-cms-auth`](packages/uncial-cms-auth)**: the stateless worker that signs editors in with repo-scoped GitHub App tokens.

## Quick start

In a SvelteKit or Astro project:

```sh
pnpm add uncial uncial-cms
pnpm exec uncial-cms init
pnpm dev
```

Before `pnpm dev`, add the config lines `init` prints. Open `/edit/` to edit the home page. A Block is one Svelte file:

```svelte
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

The [docs](https://d-flood.github.io/uncial/docs/) cover the rest. They are themselves edited with uncial-cms.

## Development

```sh
pnpm install
pnpm run check
pnpm run test:unit -- --run
pnpm run test:browser -- --run   # needs `pnpm exec playwright install`
pnpm run test:e2e
pnpm run build
```

For user-facing changes, run `pnpm run changeset` and commit the changeset with your PR. Merging the Changesets version PR publishes to npm.
