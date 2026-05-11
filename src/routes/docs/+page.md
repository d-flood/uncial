<svelte:head>

<title>Uncial Documentation</title>
<meta
		name="description"
		content="Single-page guide for installing Uncial, defining blocks, editing JSON documents, rendering output, and validating content."
	/>
</svelte:head>

<main class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
	<div class="grid gap-10 lg:grid-cols-[16rem_1fr]">
		<aside class="hidden lg:block">
			<nav class="sticky top-6" aria-label="On this page">
				<ul class="menu border border-base-300 bg-base-100 p-2">
					<li class="menu-title">On this page</li>
					<li><a href="#install">Install</a></li>
					<li><a href="#blocks">Define blocks</a></li>
					<li><a href="#setup">Registry and schema</a></li>
					<li><a href="#usage">Editor and Renderer</a></li>
					<li><a href="#attributes">Attributes</a></li>
					<li><a href="#containers">Container blocks</a></li>
					<li><a href="#validation">Validation</a></li>
					<li><a href="#security">Security</a></li>
				</ul>
			</nav>
		</aside>

    	<div class="uncial-rich-content space-y-12">
    		<section id="install" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Install</p>
    			<h2 class="text-3xl font-bold">Add Uncial to a Svelte 5 app</h2>

Install the package in your application. Uncial expects `svelte@^5` as a peer dependency.

```bash
# Terminal
npm install uncial
pnpm add uncial
bun add uncial
```

    		</section>

    		<section id="blocks" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Blocks</p>
    			<h2 class="text-3xl font-bold">Define a custom block once</h2>

A block definition gives Uncial a stable `id`, an editor label, normalized attribute defaults, and the Svelte component used by both the editor and renderer.

        			<div class="space-y-4">

```svelte
<!-- src/lib/blocks/PromoCard.svelte -->
<script lang="ts">
	interface Props {
		title?: string;
		body?: string;
	}

	let { title = 'Spring launch', body = 'Save 20% on featured plans.' }: Props = $props();
</script>

<article class="promo-card">
	<h3>{title}</h3>
	<p>{body}</p>
</article>
```

```ts
// src/lib/blocks/promoCard.ts
import { defineBlock } from 'uncial';
import PromoCard from './PromoCard.svelte';

export const promoCard = defineBlock({
	id: 'promoCard',
	label: 'Promo Card',
	description: 'A reusable promotional card block',
	attributes: {
		title: '',
		featured: false,
		priority: { default: 0, input: 'number' },
		metadata: { default: { theme: 'sand' }, input: 'json' }
	},
	component: PromoCard
});
```

    			</div>
    		</section>

    		<section id="setup" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Setup</p>
    			<h2 class="text-3xl font-bold">Create the registry, schema, and controller</h2>

The registry is the shared block catalog. The schema controls allowed blocks and marks. The attributes controller powers block and link editing UI.

```ts
// src/lib/uncial.ts
import { createBlockAttributesController, createBlockRegistry, createSchema } from 'uncial';
import { promoCard } from './blocks/promoCard';

export const blocks = createBlockRegistry([promoCard]);
export const schema = createSchema(blocks);
export const attributesController = createBlockAttributesController();
```

    		</section>

    		<section id="usage" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Usage</p>
    			<h2 class="text-3xl font-bold">Edit and render the same JSON</h2>

Bind your document to `Editor` with `bind:json`. Later, pass the saved document to `Renderer` as `content` with the same blocks and schema.

```svelte
<!-- src/routes/editor/+page.svelte -->
<script lang="ts">
	import { Editor, Renderer } from 'uncial';
	import { attributesController, blocks, schema } from './uncial';

	let document = $state({
		type: 'doc',
		content: [{ type: 'paragraph' }]
	});
</script>

<Editor {blocks} {schema} {attributesController} bind:json={document} />
<Renderer content={document} {blocks} {schema} />
```

    		</section>

    		<section id="attributes" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Attributes</p>
    			<h2 class="text-3xl font-bold">Describe editable block data</h2>

    			<div class="overflow-x-auto border border-base-300">
    				<table class="table">
    					<thead>
    						<tr>
    							<th>Spec</th>
    							<th>Use</th>
    						</tr>
    					</thead>
    					<tbody>
    						<tr>
    							<td><code>default</code></td>
    							<td>Required fallback value. Shorthand values like <code>title: ""</code> become defaults.</td>
    						</tr>
    						<tr>
    							<td><code>input</code></td>
    							<td>Editor control hint: <code>text</code>, <code>textarea</code>, <code>number</code>, <code>checkbox</code>, <code>json</code>, <code>richtext</code>, or <code>select</code>.</td>
    						</tr>
    						<tr>
    							<td><code>required</code></td>
    							<td>Marks an attribute as required during validation.</td>
    						</tr>
    						<tr>
    							<td><code>validate</code></td>
    							<td>Custom predicate for accepting or rejecting an attribute value.</td>
    						</tr>
    						<tr>
    							<td><code>parse / serialize</code></td>
    							<td>Coerce values at editor or persistence boundaries.</td>
    						</tr>
    						<tr>
    							<td><code>options</code></td>
    							<td>Allowed values for select-style attributes.</td>
    						</tr>
    					</tbody>
    				</table>
    			</div>
    		</section>

    		<section id="containers" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Containers</p>
    			<h2 class="text-3xl font-bold">Allow nested document flow</h2>

Atomic blocks have no child content. Add `content: { kind: 'flow' }` when a block should own one default child region. The block component receives attribute props plus a `children` snippet for that region.

        			<div class="space-y-4">

```ts
// src/lib/blocks/collapsible.ts
import { defineBlock } from 'uncial';
import Collapsible from './Collapsible.svelte';

export const collapsible = defineBlock({
	id: 'collapsible',
	label: 'Collapsible',
	attributes: {
		title: ''
	},
	component: Collapsible,
	content: { kind: 'flow' }
});
```

```svelte
<!-- src/lib/blocks/Collapsible.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		children?: Snippet;
	}

	let { title = '', children }: Props = $props();
</script>

<details class="collapse collapse-arrow border border-base-300 bg-base-100">
	<summary class="collapse-title font-semibold">{title}</summary>
	<div class="collapse-content">
		{#if children}
			{@render children()}
		{/if}
	</div>
</details>
```

    			</div>
    		</section>

    		<section id="validation" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Validation</p>
    			<h2 class="text-3xl font-bold">Normalize and validate before publish</h2>

Use `normalizeDocument` and `validateDocument` around persistence boundaries, or pass `onIssue` to `Editor` and `Renderer` to observe document issues as they happen.

```ts
// src/lib/publish.ts
import { normalizeDocument, validateDocument } from 'uncial';
import { blocks, schema } from './uncial';

const normalized = normalizeDocument(document, blocks, schema);
const result = validateDocument(normalized, blocks, schema, {
	onIssue: (issue) => console.warn(issue.code, issue.path)
});

if (!result.ok) {
	throw new Error('Document is not publishable');
}
```

    		</section>

    		<section id="security" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Security</p>
    			<h2 class="text-3xl font-bold">Render known blocks, validate user content</h2>

    			<ul class="list bg-base-100">
    				<li class="list-row">Renderer uses the block registry you provide, so unknown custom blocks are not rendered as trusted components.</li>
     				<li class="list-row">Built-in rich text links are sanitized to http, https, mailto, tel, relative paths, and hash links.</li>
      				<li class="list-row">Run validation before publishing or saving user-authored documents.</li>
        				<li class="list-row">Custom block components and html.render hooks are trusted application code; sanitize any raw HTML or navigation attributes they emit.</li>
      			</ul>
    		</section>
    	</div>
    </div>

</main>
