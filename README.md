# Uncial

Uncial is a backend-agnostic Svelte block editor built on Tiptap. Library consumers define a block once as a Svelte component, register it with `defineBlock(...)`, and reuse that same block definition in both the WYSIWYG editor and the renderer.

Custom blocks can stay atomic or declare one default child content region for nested document flow.

## What ships today

- Shared block definitions for editor and renderer
- Atomic blocks and container blocks with nested child content
- Registry and schema helpers for block and mark allowlists
- Typed attribute normalization for strings, numbers, booleans, and JSON-like fields
- Document normalization with version stamping
- Validation hooks for editor and renderer boundaries
- SSR-safe renderer imports separated from browser-only editor behavior

## Install

```sh
npm install uncial
pnpm add uncial
bun add uncial
```

Peer dependency:

- `svelte@^5`

## Quick start

Define a standard Svelte component first:

```svelte
<!-- PromoCard.svelte -->
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

Then register and use that component as an Uncial block:

```svelte
<script lang="ts">
	import {
		Editor,
		Renderer,
		createBlockAttributesController,
		createBlockRegistry,
		createSchema,
		defineBlock
	} from 'uncial';
	import PromoCard from './PromoCard.svelte';

	const promoCard = defineBlock({
		id: 'promoCard',
		label: 'Promo Card',
		attributes: {
			title: '',
			featured: false,
			priority: 0,
			metadata: { default: { theme: 'sand' }, input: 'json' }
		},
		component: PromoCard
	});

	const blocks = createBlockRegistry([promoCard]);
	const schema = createSchema(blocks);
	const attributesController = createBlockAttributesController();

	let document = {
		type: 'doc',
		content: [{ type: 'paragraph' }]
	};
</script>

<Editor {blocks} {schema} {attributesController} bind:json={document} />
<Renderer content={document} {blocks} {schema} />
```

## Web components

React, Vue, and vanilla browser apps can register browser-native elements with a client-side import:

```ts
import 'uncial/web-components';
```

Use DOM properties for complex values such as registries, schemas, documents, extensions, and controllers:

```ts
const renderer = document.querySelector('uncial-renderer');
Object.assign(renderer, { blocks, schema, content: document });

const editor = document.querySelector('uncial-editor');
Object.assign(editor, { blocks, schema, json: document, attributesController });
```

```html
<uncial-editor></uncial-editor>
<uncial-renderer></uncial-renderer>
```

Validation callbacks are emitted as bubbling, composed DOM events. Editor document updates are emitted as `uncial-change` because non-Svelte hosts cannot use `bind:json`:

```ts
editor.addEventListener('uncial-change', (event) => {
	document = event.detail;
});

renderer.addEventListener('uncial-issue', (event) => {
	console.warn(event.detail.code, event.detail.path);
});
```

For SSR frameworks, import `uncial/web-components` on the client only. Host frameworks can mount the elements, but block definitions currently still point to Svelte components.

## Styling and customization

The root `Editor` and `Renderer` exports ship with Uncial's starter shell and default component-scoped styling.

If you want to own the editor layout yourself, use `bindEditor(...)` on an element you control:

```svelte
<script lang="ts">
	import type { Editor as TiptapEditor } from '@tiptap/core';
	import { bindEditor, Renderer } from 'uncial';

	let document = $state({
		type: 'doc',
		content: [{ type: 'paragraph' }]
	});
	let editor = $state<TiptapEditor | null>(null);
</script>

<div
	use:bindEditor={{
		blocks,
		schema,
		json: document,
		onChange: (nextDocument) => {
			document = nextDocument;
		},
		onEditor: (nextEditor) => {
			editor = nextEditor;
		}
	}}
/>
<Renderer content={document} {blocks} {schema} />
```

## Block definition

Use `component` when the same Svelte component should render in both the editor and the frontend output.

```ts
const hero = defineBlock({
	id: 'hero',
	label: 'Hero',
	attributes: {
		title: '',
		subtitle: { default: '', input: 'textarea' },
		featured: false,
		priority: 1,
		settings: { default: { align: 'left' }, input: 'json' }
	},
	component: Hero
});
```

Attribute specs support:

- `default`: required default value
- `required`: require a value at validation time
- `validate`: custom validation predicate
- `parse`: custom coercion from editor or serialized input
- `serialize`: custom serialization for HTML persistence
- `input`: one of `text`, `textarea`, `number`, `checkbox`, or `json`
- `placeholder`: optional editor placeholder

Blocks can also opt into child content:

```ts
const collapsible = defineBlock({
	id: 'collapsible',
	label: 'Collapsible',
	attributes: {
		title: ''
	},
	component: Collapsible,
	content: { kind: 'flow' }
});
```

Container block components receive:

- attribute props as usual
- `content`: normalized child `PMNode[]`
- `children`: a built-in snippet for rendering or placing the child region

Example:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		children?: Snippet;
	}

	let { title = '', children }: Props = $props();
</script>

<details>
	<summary>{title}</summary>
	<div>
		{#if children}
			{@render children()}
		{/if}
	</div>
</details>
```

## Content model

- Documents are ProseMirror-compatible JSON objects
- `normalizeDocument(...)` stamps the current document version and coerces known block attributes
- Unknown custom block attributes are stripped during normalization
- Atomic custom blocks drop accidental child content during normalization
- Container custom blocks preserve validated child content
- Disallowed marks are removed when a schema is supplied

## Validation

Use `validateDocument(...)` directly or pass `onIssue` into `Editor` or `Renderer` to observe issues during normalization and render flows.

```svelte
<Editor
	{blocks}
	{schema}
	bind:json={document}
	onIssue={(issue) => console.warn(issue.code, issue.path)}
/
>
```

## Rendering and security

- Renderer output is driven by the same block registry used by the editor
- Built-in rich text rendering supports headings, lists, blockquotes, code blocks, inline code, strike, bold, italic, and links
- Links are sanitized to allow only `http`, `https`, `mailto`, `tel`, relative paths, and hash links
- Custom block components and `html.render` hooks are trusted application code; sanitize any raw HTML or navigation attributes they emit

## Development

```sh
bun run check
bun run test:unit -- --run
bun run build
```

Additional suites:

- `bun run test:browser -- --run` for browser-backed Svelte component tests
- `bun run test:e2e` for Playwright end-to-end tests

Browser-backed tests require Playwright browsers to be installed:

```sh
bunx playwright install
```

## Releasing

For user-facing library changes, run `bun run changeset` and commit the generated changeset with your PR. After regular PRs merge into `main`, Changesets opens or updates a version PR. Merging that version PR publishes `uncial` to npm with trusted publishing/provenance and creates the GitHub release.

## Status

Uncial is currently a production-hardening library project rather than a finished CMS platform. The API is focused on typed custom blocks with editor/render parity, including container-style blocks with nested content.
