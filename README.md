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
			body: { default: '', input: 'textarea' }
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

// Document metadata mirrors the document body: set `metaFields` to render the
// metadata editor and read/write `meta` for the current values.
Object.assign(editor, { metaFields, meta: document.meta });
```

```html
<uncial-editor></uncial-editor> <uncial-renderer></uncial-renderer>
```

Property assignments update the mounted component in place. Setting `editor.json = nextDocument` syncs the existing Tiptap editor through `setContent` instead of recreating it, so focus, selection, and undo history survive external document updates.

> **Configuration is via JS properties, not HTML attributes — by design.** The
> element inputs (`blocks`, `schema`, `json`, `meta`, `metaFields`, `extensions`,
> controllers, …) are structured objects, functions, and Svelte components that
> do not round-trip through string HTML attributes, so `<uncial-editor json="…">`
> is intentionally **not** observed. The one exception is `stylesheet` (a plain
> URL string), which is reflected as an attribute (see below). Set everything else
> as a property (`el.json = …`) after the element is in the DOM.

### Styling the shadow root

Both elements render into an open shadow root, so page-level stylesheets do not reach them. Pass one or more whitespace-separated stylesheet URLs through the `stylesheet` attribute (or matching DOM property); each URL is rendered as a `<link rel="stylesheet">` inside the shadow root:

```html
<uncial-editor stylesheet="https://unpkg.com/uncial/dist/styles/index.css"></uncial-editor>
```

With a bundler such as Vite, resolve the packaged CSS to a URL:

```ts
import uncialStylesHref from 'uncial/styles?url';

const editor = document.querySelector('uncial-editor');
editor.stylesheet = uncialStylesHref;
```

A URL-based hook is used because the package ships its default CSS as plain files (`uncial/styles`, `uncial/styles/chrome`, ...) that any bundler, CDN, or asset pipeline can serve, and the `@import` chains inside them resolve relative to the linked URL — something constructed stylesheets (`adoptedStyleSheets`) do not support. Because the shadow root is open, advanced hosts can still inject constructed stylesheets themselves via `element.shadowRoot.adoptedStyleSheets`. The `--uncial-*` custom properties inherit across the shadow boundary, so token-based theming on a wrapper element keeps working (see [Styling and customization](#styling-and-customization)).

### Events

Validation callbacks are emitted as bubbling, composed DOM events. Editor document updates are emitted as `uncial-change` because non-Svelte hosts cannot use `bind:json`:

```ts
editor.addEventListener('uncial-change', (event) => {
	document = event.detail; // the normalized document JSON; editor.json reflects the same value
});

editor.addEventListener('uncial-meta-change', (event) => {
	meta = event.detail; // the committed document metadata; editor.meta reflects the same value
});

renderer.addEventListener('uncial-issue', (event) => {
	console.warn(event.detail.code, event.detail.path);
});
```

`uncial-change` fires for edits made inside the editor, and at most once after an external `editor.json` assignment (only when normalization changes the incoming document, for example by stamping a version). Feeding a previously emitted document back into `editor.json` is a no-op, so hosts can mirror the value into their own state without creating an update loop. `uncial-meta-change` fires when document metadata is committed through the metadata editor and mirrors the value onto `editor.meta`, exactly as `uncial-change` does for `editor.json`. `uncial-issue` fires on both elements whenever normalization or validation reports a problem.

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
	description: 'Full-width intro banner', // optional; shown in the insert menu
	attributes: {
		title: '',
		subtitle: { default: '', input: 'textarea' },
		featured: false,
		priority: 1,
		align: { default: 'left', options: ['left', 'center', 'right'] },
		settings: { default: { align: 'left' }, input: 'json' }
	},
	component: Hero
});
```

A bare value (`title: ''`) is shorthand for `{ default: '' }`. The full attribute
spec supports:

- `default`: required default value
- `required`: require a value at validation time
- `validate`: custom validation predicate
- `parse`: custom coercion from editor or serialized input
- `serialize`: custom serialization for HTML persistence
- `input`: editor control hint — `text`, `textarea`, `number`, `checkbox`, `json`, `select`, `richtext`, or `hidden`. When omitted it is inferred from the default value (and from `options`, which implies `select`).
- `options`: allowed values for `select` inputs, either plain values or `{ value, label, description }` objects
- `richText`: for `richtext` inputs, a `{ features, placeholder }` object controlling the nested rich-text feature allowlist
- `placeholder`: optional editor placeholder

Blocks themselves also accept an optional `description` and `icon` (an icon name,
inline markup, or a Svelte component) that surface in the editor's insert menu.

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
/>
```

## Rendering and security

- Renderer output is driven by the same block registry used by the editor
- Built-in rich text rendering supports headings, lists, blockquotes, code blocks, inline code, strike, bold, italic, and links
- Links are sanitized to allow only `http`, `https`, `mailto`, `tel`, relative paths, and hash links
- Custom block components and `html.render` hooks are trusted application code; sanitize any raw HTML or navigation attributes they emit

## SSR usage

The renderer is safe to import in a server bundle. Import from the granular entry points so
the editor mount stack (Tiptap, `BlockNodeView`, `mount()`/`unmount()`) never reaches your
server:

```ts
import { Renderer } from 'uncial/render';
import { defineSvelteBlock, createBlockRegistry, createSchema } from 'uncial/core';
```

`uncial/render` and `uncial/core` are free of browser-only editor machinery — a regression
test walks the `render/` import graph and fails if an editor/runtime import creeps back in.

The package root barrel (`import … from 'uncial'`) re-exports `uncial/editor` as well, so
importing from the root **does** pull the editor graph into your bundle. For SSR, prefer the
`uncial/render` + `uncial/core` entry points over the root barrel.

> TODO: a future major may drop `./editor` from the root barrel so `import 'uncial'` is
> SSR-lean by default. Until then, use the granular entry points on the server.

## Related packages

This repository is a workspace that also ships:

- **[`uncial-cms`](packages/uncial-cms)** — a git-forge-backed static CMS
  runtime. Every content page gets a generated editor variant; editors sign in
  with GitHub and save edits as commits, with the repository as the single
  source of truth. Includes SvelteKit route factories and a framework-agnostic
  web-component runtime. [Live demo](https://d-flood.github.io/uncial/cms-demo/).
- **[`uncial-cms-auth`](packages/uncial-cms-auth)** — the stateless Cloudflare
  Worker behind uncial-cms's default auth, releasing single-repo-scoped GitHub
  App tokens to the browser. A canonical instance is hosted by the project;
  self-hosting is first-class.
- **[`uncial-wagtail`](packages/uncial-wagtail)** — Wagtail integration storing
  an Uncial document in a `JSONField` and serving it as a headless JSON payload.

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
