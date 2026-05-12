# Uncial

[Demo](https://d-flood.github.io/uncial/) | [Docs](https://d-flood.github.io/uncial/docs/) | [GitHub](https://github.com/d-flood/uncial)

Uncial is a backend-agnostic block editor built on Tiptap. It turns a normal frontend framework component into an editable block in a richtext editor. It supports any frontend framework though Svelte is supported out of the box today. Library consumers define a block once as a component, register it with `defineSvelteBlock(...)`, and reuse that same block definition in both the WYSIWYG editor and the SSR-capable renderer.

Custom blocks can stay atomic or declare one default child content region for nested document flow.

![screenshot of the Uncial richtext and block editorwith a callout component selected](.github/images/basic%20editor.png)
![screen recording demonstrating editing main page text and custom components](.github/images/basic%20text%20and%20component%20editing.gif)

## What ships today

- Shared block definitions for editor and renderer
- Atomic blocks and container blocks with nested child content
- Registry and schema helpers for block and mark allowlists
- Typed attribute normalization for strings, numbers, booleans, and JSON-like fields
- Document normalization with version stamping
- Validation hooks for editor and renderer boundaries
- SSR-safe renderer imports separated from browser-only editor behavior
- A public runtime plugin contract for third-party React, Vue, Web Component, or vanilla runtimes

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
	import 'uncial/styles';
	import {
		Editor,
		Renderer,
		createBlockAttributesController,
		createBlockRegistry,
		createSchema,
		defineSvelteBlock
	} from 'uncial';
	import PromoCard from './PromoCard.svelte';

	const promoCard = defineSvelteBlock({
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
<uncial-editor></uncial-editor> <uncial-renderer></uncial-renderer>
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

For SSR frameworks, import `uncial/web-components` on the client only. Svelte blocks still render through the Svelte renderer for SSR; non-Svelte block runtimes should provide their own full-document renderer rather than relying on mixed component islands.

## Runtime plugins

Uncial's core block model is runtime-neutral. `defineSvelteBlock(...)` is the first-party helper for the bundled Svelte runtime, and `defineRuntimeBlock(runtimePlugin, config)` is the public escape hatch for third-party runtimes.

Registries currently allow a single runtime per document. Empty registries and one-runtime registries are valid; mixed-runtime registries fail fast so future non-Svelte SSR can be implemented as full-document runtime renderers.

Runtime plugins normalize native components and may provide editor node-view mounting with `destroy()` and optional `update()` lifecycle hooks. Container block children are exposed as a runtime-specific child outlet; plugins must leave ProseMirror-owned child DOM under editor control. SSR-capable runtimes should provide a renderer that can render the whole document for that runtime.

```ts
import { defineRuntimeBlock } from 'uncial/core';
import { reactRuntime } from 'uncial-react-runtime';

export function defineReactBlock(config) {
	return defineRuntimeBlock(reactRuntime, config);
}
```

## Styling and customization

The root `Editor` and `Renderer` exports ship stable `uncial-*` classes and optional default CSS. Import the CSS layer you want once in your app:

```ts
// Full default editor, renderer, controls, and rich text prose styles.
import 'uncial/styles';

// Editor chrome only. Use this if your app owns rich text typography.
import 'uncial/styles/chrome';
```

Uncial does not require Tailwind or DaisyUI. The default styles are plain CSS and are driven by `--uncial-*` custom properties that you can scope to your app, page, or a wrapper around the editor:

```css
.my-editor-theme {
	--brand-primary: #8b5cf6;
	--brand-surface: #101012;
	--brand-border: #303039;
}

.my-editor-theme .uncial-editor-shell,
.my-editor-theme .uncial-renderer,
.my-editor-theme .uncial-attrs-panel,
.my-editor-theme .uncial-link-panel,
.my-editor-theme .uncial-richtext-wrapper,
.my-editor-theme .uncial-block-menu {
	--uncial-color-surface: var(--brand-surface);
	--uncial-color-surface-elevated: #19191d;
	--uncial-color-border: var(--brand-border);
	--uncial-color-text: #f4f4f5;
	--uncial-color-primary: var(--brand-primary);
	--uncial-color-primary-contrast: #ffffff;
	--uncial-color-accent: #f59e0b;
	--uncial-color-focus-ring: var(--brand-primary);
	--uncial-color-code-bg: #171717;
	--uncial-color-code-text: #fafafa;

	--uncial-radius-sm: 0.375rem;
	--uncial-radius-md: 0.625rem;
	--uncial-radius-lg: 1rem;

	--uncial-font-body: Inter, system-ui, sans-serif;
}
```

Wrap the editor with that class:

```svelte
<div class="my-editor-theme">
	<Editor {blocks} {schema} bind:json={document} />
	<Renderer content={document} {blocks} {schema} />
</div>
```

Core token groups:

| Token                                                                                                                                      | Purpose                              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `--uncial-color-bg`, `--uncial-color-surface`, `--uncial-color-surface-elevated`                                                           | Page/editor surfaces                 |
| `--uncial-color-border`, `--uncial-color-border-strong`                                                                                    | Borders and separators               |
| `--uncial-color-text`, `--uncial-color-text-muted`, `--uncial-color-text-inverted`                                                         | Foreground colors                    |
| `--uncial-color-primary`, `--uncial-color-primary-contrast`, `--uncial-color-accent`, `--uncial-color-danger`, `--uncial-color-focus-ring` | Actions, links, errors, focus states |
| `--uncial-color-code-bg`, `--uncial-color-code-text`                                                                                       | Fenced code block colors             |
| `--uncial-font-body`, `--uncial-font-display`, `--uncial-font-mono`                                                                        | Typography families                  |
| `--uncial-font-size-base`, `--uncial-line-height`, `--uncial-font-weight-regular`, `--uncial-font-weight-strong`                           | Typography scale                     |
| `--uncial-radius-sm`, `--uncial-radius-md`, `--uncial-radius-lg`                                                                           | Control and shell radii              |
| `--uncial-space-1` through `--uncial-space-6`                                                                                              | Spacing scale                        |
| `--uncial-gutter-width`, `--uncial-gutter-width-sm`, `--uncial-toolbar-gap`, `--uncial-panel-width`                                        | Editor structure                     |
| `--uncial-shadow-sm`, `--uncial-shadow-md`, `--uncial-transition`                                                                          | Depth and motion                     |

Rich text output uses the stable `.uncial-rich-content` hook. To bring your own prose styles, import only the chrome layer and target that class:

```ts
import 'uncial/styles/chrome';
```

```css
.article-editor .uncial-rich-content {
	font: 400 1rem/1.7 var(--site-body-font);
	color: var(--site-ink);
}

.article-editor .uncial-rich-content h2 {
	font: 700 1.75rem/1.2 var(--site-display-font);
	margin-block: 2rem 0.75rem;
}
```

If you use Tailwind Typography, apply it to the same hook in your app stylesheet:

```css
.article-editor .uncial-rich-content {
	@apply prose prose-neutral max-w-none;
}
```

Phosphor is the default icon set for Uncial controls. Icon override props are planned for a future theming tier.

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
const hero = defineSvelteBlock({
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
const collapsible = defineSvelteBlock({
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
