<script lang="ts">
	import DocsToc from '$lib/ui/DocsToc.svelte';

	const tocItems = [
		{ id: 'why', label: 'Why Uncial' },
		{ id: 'install', label: 'Install' },
		{ id: 'blocks', label: 'Define blocks' },
		{ id: 'setup', label: 'Registry and schema' },
		{ id: 'usage', label: 'Editor and Renderer' },
		{ id: 'metadata', label: 'Document metadata' },
		{ id: 'theming', label: 'Custom theming' },
		{ id: 'attributes', label: 'Attributes' },
		{ id: 'runtime-plugins', label: 'Runtime plugins' },
		{ id: 'containers', label: 'Container blocks' },
		{ id: 'validation', label: 'Validation' },
		{ id: 'ssr', label: 'Server rendering' },
		{ id: 'web-components', label: 'Web components' },
		{ id: 'wagtail', label: 'Wagtail' },
		{ id: 'security', label: 'Security' }
	];
</script>

<svelte:head>

<title>Uncial Documentation</title>
<meta
		name="description"
		content="Why Uncial exists and how to use it: write blocks once as components and use your real presentation layer as the CMS editor — install, define blocks, edit and render JSON documents, and validate content."
	/>
</svelte:head>

<main class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
	<div class="grid gap-10 lg:grid-cols-[16rem_1fr]">
		<aside class="hidden lg:block">
			<DocsToc items={tocItems} />
		</aside>

    	<div class="uncial-rich-content space-y-12">
    		<section id="why" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Why Uncial</p>
    			<h2 class="text-3xl font-bold">Your presentation layer is the editor</h2>

If you've built a site on a headless CMS, you know the failure mode. The CMS generates its editing UI from your data model, so a page becomes a wall of stacked form fields. Nest a few blocks — a section containing columns containing cards containing rich text — and editing turns into an archaeology dig: endless vertical scrolling through collapsed panels that look nothing like the page they produce. Wagtail's deeply nested StreamFields are the canonical example, but every schema-driven admin has this shape.

You have two bad options from there:

1. **Live with the generated forms.** Editors lose all sense of what they're building. "Which of these five identical `Section` panels is the one above the fold?" becomes a daily question.
2. **Customize the admin.** Now you maintain *two* frontends — the real one and the editing one — plus a translation layer that maps admin widgets to rendered output. Every new block means writing it twice and keeping the two in sync forever.

Uncial removes the fork. You write a block **once**, as an ordinary frontend component — the same component your site renders in production. Uncial mounts that component *inside* the editor as a live, editable block, and mounts it again (SSR-capable) in your frontend. The editor is not a form that approximates the page; it **is** the page, with editing chrome around it.

Uncial isn't tied to one framework. **Svelte is the bundled, first-class runtime today**, but the core block model is runtime-neutral: [runtime plugins](#runtime-plugins) let React, Vue, or vanilla components become blocks the same way, and [web components](#web-components) let any app host the editor and renderer right now.

This also dissolves the other classic headless problem: **preview**. When the editing surface renders the same components with the same document JSON as production, preview isn't a feature you bolt on with draft APIs and iframe round-trips — it's just what the editor looks like. What the editor sees is what the reader gets, because it's literally the same code.

Concretely, one block definition gives you:

- a WYSIWYG editing experience where nested content looks nested, not stacked,
- an SSR-capable renderer for your public frontend,
- typed attribute editing UI derived from the component's props,
- and a plain ProseMirror-compatible JSON document your backend can store anywhere — including, via [`uncial-wagtail`](#wagtail), a regular Wagtail page field.

The rest of this page walks that path: install, define a block, wire up the editor and renderer, then go as deep as containers, theming, SSR, and web components.

    		</section>

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
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Define blocks</p>
    			<h2 class="text-3xl font-bold">Define a custom block once</h2>

This is the core move: a block starts life as a plain Svelte component — no editor imports, no CMS awareness. `defineSvelteBlock` then wraps it with a stable `id`, an editor label, and typed attribute defaults. That one definition powers both the WYSIWYG editor *and* the SSR-capable renderer, so there is no second "admin widget" to write and no translation layer to keep in sync.

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
import { defineSvelteBlock } from 'uncial';
import PromoCard from './PromoCard.svelte';

export const promoCard = defineSvelteBlock({
	id: 'promoCard',
	label: 'Promo Card',
	description: 'A reusable promotional card block',
	attributes: {
		title: '',
		body: { default: '', input: 'textarea' }
	},
	component: PromoCard
});
```

    			</div>
    		</section>

    		<section id="setup" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Registry and schema</p>
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
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Editor and Renderer</p>
    			<h2 class="text-3xl font-bold">Edit and render the same JSON</h2>

Editor and renderer share one document and one block registry. Bind your document to `Editor` with `bind:json`; pass the saved document to `Renderer` as `content` with the same blocks and schema. Because both sides render your actual components, the editor doubles as a live preview — there's no separate preview pipeline to build.

```svelte
<!-- src/routes/editor/+page.svelte -->
<script lang="ts">
	import 'uncial/styles';
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

     		<section id="metadata" class="space-y-4 scroll-mt-6">
     			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Document metadata</p>
     			<h2 class="text-3xl font-bold">Edit document-level metadata</h2>

Add typed `metaFields` to your schema for frontmatter-style data such as title, author, publish date, or tags. Metadata is stored as JSON on the top-level document `meta` field and is not serialized to YAML.

```svelte
<script lang="ts">
	import {
		DocumentMetaPanel,
		Editor,
		createDocumentMetaController,
		createSchema
	} from 'uncial';

	const schema = createSchema(blocks, {
		metaFields: {
			title: { default: '', required: true },
			author: { default: '' },
			publishedAt: { default: '', placeholder: 'YYYY-MM-DD' },
			tags: { default: [], input: 'json' }
		}
	});

	const metaController = createDocumentMetaController(schema.metaFields);
	let document = $state({ type: 'doc', content: [{ type: 'paragraph' }] });
	let meta = $state({ title: 'Hello world', author: 'Ada' });
</script>

<Editor {blocks} {schema} {metaController} bind:json={document} bind:meta />
<DocumentMetaPanel
	controller={metaController}
	fields={schema.metaFields}
	onCommit={(nextMeta) => (meta = nextMeta)}
/>
```

When metadata fields are configured, `Editor` also shows a built-in `Metadata` button in the toolbar. `DocumentMetaPanel` remains available for apps that prefer a permanent sidebar or custom placement.

The renderer normalizes the same metadata and exposes it as an optional snippet prop.

```svelte
<Renderer content={document} {blocks} {schema}>
	{#snippet meta(meta)}
		<h1>{meta?.title}</h1>
	{/snippet}
</Renderer>
```

     		</section>

     	<section id="theming" class="space-y-4 scroll-mt-6">
    		<p class="text-sm font-semibold uppercase tracking-wide text-primary">Custom theming</p>
    		<h2 class="text-3xl font-bold">Match Uncial to your site</h2>

Uncial's editor and renderer chrome are plain CSS. Tailwind and DaisyUI are not required by the library. Import the default styles once, then override `--uncial-*` custom properties anywhere above the editor in the cascade.

```ts
// Full default editor, renderer, controls, and rich text prose styles.
import 'uncial/styles';

// Or import only the editor chrome if your app owns prose typography.
import 'uncial/styles/chrome';
```

Scope theme tokens to a wrapper when one page should look different from the rest of your app:

```svelte
<div class="your-custom-class">
	<Editor {blocks} {schema} bind:json={document} />
	<Renderer content={document} {blocks} {schema} />
	<BlockAttributesPanel controller={attributesController} {blocks} />
</div>
```

```css
.your-custom-class .uncial-editor-shell,
.your-custom-class .uncial-renderer,
.your-custom-class .uncial-attrs-panel,
.your-custom-class .uncial-link-panel,
.your-custom-class .uncial-richtext-wrapper,
.your-custom-class .uncial-block-menu {
	--uncial-color-surface: white;
	--uncial-color-surface-elevated: #f6f3ee;
	--uncial-color-border: #d8cab8;
	--uncial-color-text: #241a12;
	--uncial-color-text-muted: #756657;
	--uncial-color-primary: #7c3aed;
	--uncial-color-primary-contrast: white;
	--uncial-color-accent: #d97706;
	--uncial-color-danger: #dc2626;
	--uncial-color-focus-ring: #7c3aed;

	--uncial-radius-sm: 0.25rem;
	--uncial-radius-md: 0.5rem;
	--uncial-radius-lg: 0.875rem;

	--uncial-font-body: Inter, system-ui, sans-serif;
	--uncial-font-display: Georgia, serif;
	--uncial-font-mono: 'IBM Plex Mono', ui-monospace, monospace;
}
```

The most common tokens are:

<div class="overflow-x-auto border border-base-300">
	<table class="table">
		<thead>
			<tr>
				<th>Token</th>
				<th>Controls</th>
			</tr>
		</thead>
		<tbody>
			<tr><td><code>--uncial-color-primary</code></td><td>Primary buttons, links, active controls, block focus outlines.</td></tr>
			<tr><td><code>--uncial-color-primary-contrast</code></td><td>Text/icons on primary buttons.</td></tr>
			<tr><td><code>--uncial-color-accent</code></td><td>Secondary emphasis color for consumers who want one.</td></tr>
			<tr><td><code>--uncial-color-surface</code></td><td>Main editor and renderer background.</td></tr>
			<tr><td><code>--uncial-color-surface-elevated</code></td><td>Toolbar, inputs, nested block surfaces.</td></tr>
			<tr><td><code>--uncial-color-border</code></td><td>Control, panel, renderer, and block chrome borders.</td></tr>
			<tr><td><code>--uncial-color-text</code></td><td>Editor UI and rich text foreground.</td></tr>
			<tr><td><code>--uncial-color-code-bg</code></td><td>Fenced code block background. Defaults dark in both light and dark themes.</td></tr>
			<tr><td><code>--uncial-radius-sm/md/lg</code></td><td>Buttons, inputs, panels, renderer, and block chrome radius.</td></tr>
			<tr><td><code>--uncial-font-body/display/mono</code></td><td>Editor UI, headings, and code typography.</td></tr>
		</tbody>
	</table>
</div>

Rich text uses a stable `.uncial-rich-content` hook. If your site already has article typography, import `uncial/styles/chrome` and style that hook yourself:

```css
.your-custom-class .uncial-rich-content {
	font: 400 1rem/1.7 var(--site-body-font);
	color: var(--site-ink);
}

.your-custom-class .uncial-rich-content h2 {
	font: 700 1.75rem/1.2 var(--site-display-font);
	margin-block: 2rem 0.75rem;
}
```

    	</section>

    		<section id="attributes" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Attributes</p>
    			<h2 class="text-3xl font-bold">Describe editable block data</h2>

Attribute specs are how Uncial derives the editing UI you'd otherwise hand-build: each spec maps a component prop to a typed, validated control in the block attributes panel.

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

    	<section id="runtime-plugins" class="space-y-4 scroll-mt-6">
    		<p class="text-sm font-semibold uppercase tracking-wide text-primary">Runtime plugins</p>
    		<h2 class="text-3xl font-bold">Svelte ships first, core stays neutral</h2>

Svelte is the only bundled block runtime today. Non-Svelte block authoring is enabled through public runtime plugins that normalize native components and can provide editor node-view mounting. A registry may contain blocks from only one runtime in this release; mixed-runtime documents fail fast.

Svelte blocks keep the direct Svelte renderer path, so custom block rendering remains SSR-capable. Future React or Vue support should be implemented with full-document runtime renderers that can use each framework's SSR APIs, not by mixing client-only component islands into the Svelte renderer.

```ts
import { defineRuntimeBlock } from 'uncial/core';
import { reactRuntime } from 'uncial-react-runtime';

export function defineReactBlock(config) {
	return defineRuntimeBlock(reactRuntime, config);
}
```

    	</section>

    	<section id="containers" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Container blocks</p>
    			<h2 class="text-3xl font-bold">Allow nested document flow</h2>

Nesting is where form-driven admins fall apart — and where in-place editing pays off most. Atomic blocks have no child content. Add `content: { kind: 'flow' }` when a block should own one default child region, and editors write that nested content *inside* the rendered block, exactly where it will appear — not in a collapsed sub-form three scroll-screens away. The block component receives attribute props plus a `children` snippet for that region.

        			<div class="space-y-4">

```ts
// src/lib/blocks/collapsible.ts
import { defineSvelteBlock } from 'uncial';
import Collapsible from './Collapsible.svelte';

export const collapsible = defineSvelteBlock({
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

    		<section id="ssr" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Server rendering</p>
    			<h2 class="text-3xl font-bold">Render on the server without the editor</h2>

"Same component in editor and frontend" only works if the frontend half stays lean. The `Renderer` is safe to import in a server bundle. Use the granular entry points so the browser-only editor stack (Tiptap, node views, `mount()`) never reaches your server.

```ts
// Server-safe: no editor mount code enters your bundle.
import { Renderer } from 'uncial/render';
import { createBlockRegistry, createSchema, defineSvelteBlock } from 'uncial/core';
```

`uncial/render` and `uncial/core` are free of editor machinery, and a regression test walks the `render/` import graph to keep it that way. The package root (`import ... from 'uncial'`) also re-exports the editor, so prefer these entry points on the server.

    		</section>

    		<section id="web-components" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Web components</p>
    			<h2 class="text-3xl font-bold">Use Uncial from React, Vue, or vanilla JS</h2>

React, Vue, and vanilla apps can use Uncial through browser-native custom elements. Register them once on the client, then drop the tags into your markup.

```ts
import 'uncial/web-components';
```

```html
<uncial-editor></uncial-editor>
<uncial-renderer></uncial-renderer>
```

Configure the elements with JS **properties**, not HTML attributes: the inputs are structured objects and components that do not round-trip through strings. Editor document updates arrive as a bubbling `uncial-change` event, because non-Svelte hosts cannot use `bind:json`.

```ts
const editor = document.querySelector('uncial-editor');
Object.assign(editor, { blocks, schema, json: document, attributesController });
editor.addEventListener('uncial-change', (event) => {
	document = event.detail;
});

const renderer = document.querySelector('uncial-renderer');
Object.assign(renderer, { blocks, schema, content: document });
```

Both elements render into an open shadow root, so page styles do not reach them. Pass Uncial's default CSS through the one reflected attribute, `stylesheet` (a whitespace-separated list of stylesheet URLs).

```ts
import uncialStylesHref from 'uncial/styles?url';
editor.stylesheet = uncialStylesHref;
```

    		</section>

    		<section id="wagtail" class="space-y-4 scroll-mt-6">
    			<p class="text-sm font-semibold uppercase tracking-wide text-primary">Wagtail</p>
    			<h2 class="text-3xl font-bold">Store Uncial documents in Wagtail pages</h2>

Wagtail is the origin story here: deeply nested StreamFields render as towers of stacked form panels, and headless preview requires real plumbing. The companion `uncial-wagtail` package replaces that experience — it stores an Uncial document in an ordinary Wagtail page field and mounts this editor inside the Wagtail admin, so editors work in your actual components instead of generated forms. Because the body is just JSON, the document you edit is the document served headless (with a resolved image sidecar) for your frontend to render: no admin-to-frontend translation layer, and preview comes for free.

```python
from wagtail.admin.panels import FieldPanel
from wagtail.models import Page

from uncial_wagtail.fields import UncialField
from uncial_wagtail.schema import UncialEditorConfig


class ArticlePage(Page):
    body = UncialField(config=UncialEditorConfig(allowed_blocks=["wagtail.image"]))
    content_panels = Page.content_panels + [FieldPanel("body")]
```

See the [uncial-wagtail README](https://github.com/d-flood/uncial/tree/main/packages/uncial-wagtail) for the headless API, image reference resolution, and custom block registration.

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
