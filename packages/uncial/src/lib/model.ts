import type { AnyExtension } from '@tiptap/core';
import type { Component, Snippet } from 'svelte';
import { defineRuntimeBlock } from './core/defineBlock.js';
import { DEFAULT_MARKS, createBlockRegistry, createSchema } from './core/registry.js';
import type {
	AttributeInputProps,
	AttributeSpec,
	BaseBlockConfig,
	BlockDefinition,
	BlockIcon,
	BlockRegistry,
	ContentDocument,
	ContentSchema,
	DocumentMetaSchema,
	FileValue,
	ImageValue,
	MarkDefinition,
	MetaValues,
	RenditionResolver
} from './core/types.js';
import type { ToolbarFeature } from './editor/toolbarFeatures.js';
import { svelteRuntime, type SvelteBlockComponent } from './runtime/svelte.js';

// `AttributeConfig<unknown>` collapses to `unknown`, which leaves `when` without a contextual type.
type AttributeDeclarations = Record<
	string,
	AttributeSpec<unknown> | string | number | boolean | object | null
>;

export interface BlockDeclaration<
	Attrs extends AttributeDeclarations = AttributeDeclarations
> extends Omit<BaseBlockConfig<Record<string, unknown>>, 'attributes' | 'html'> {
	attributes: Attrs;
}

type Widen<T> = T extends string
	? string
	: T extends number
		? number
		: T extends boolean
			? boolean
			: T extends readonly []
				? unknown[]
				: T extends readonly (infer Item)[]
					? Widen<Item>[]
					: T extends object
						? { -readonly [Key in keyof T]: Widen<T[Key]> }
						: T;

type NullableValue<Config> = Config extends { input: 'number' }
	? number | null
	: Config extends { input: 'image' }
		? ImageValue | null
		: Config extends { input: 'file' }
			? FileValue | null
			: Config extends { input: 'richtext' }
				? ContentDocument | null
				: unknown;

type ListItem<List> = List extends { fields: infer Fields }
	? { -readonly [Name in keyof Fields]: AttributeValue<Fields[Name]> }
	: List extends { value: infer Value }
		? AttributeValue<Value>
		: unknown;

// A rich-text attribute holds its string default until it is first edited.
type AttributeValue<Config> = Config extends { default: infer Default }
	? Default extends null
		? NullableValue<Config>
		: Config extends { input: 'richtext' }
			? ContentDocument | Extract<Default, string>
			: Config extends { list: infer List }
				? ListItem<List>[]
				: Widen<Default>
	: Widen<Config>;

/** A Block component's props, typed from its `defineBlock` declaration. */
export type BlockProps<Block extends BlockDeclaration> = {
	[Name in keyof Block['attributes']]: AttributeValue<Block['attributes'][Name]>;
} & { children?: Snippet };

/** Declares a Block in its component's `<script module>`; the component is the module's default export. */
export function defineBlock<const Attrs extends AttributeDeclarations>(
	block: BlockDeclaration<Attrs>
): BlockDeclaration<Attrs> {
	return block;
}

export interface TemplateDeclaration<Meta extends DocumentMetaSchema = DocumentMetaSchema> {
	/** Stored as the document's `template` metadata value. */
	id: string;
	label: string;
	/** Fields only this template has, on top of the model's base meta. */
	meta?: Meta;
	/** Every Block when omitted. */
	allowedBlocks?: string[];
}

/** A Page template's props, typed from its `defineTemplate` declaration. */
export type TemplateProps<
	Template extends TemplateDeclaration,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the route's own data
	Data extends Record<string, unknown> = Record<string, any>
> = {
	meta: Record<string, unknown> & MetaValues<NonNullable<Template['meta']>>;
	path: string;
	data: Data;
	body: Snippet;
};

/** Declares a Page template in its component's `<script module>`; the component is the module's default export. */
export function defineTemplate<Meta extends DocumentMetaSchema = Record<never, never>>(
	template: TemplateDeclaration<Meta>
): TemplateDeclaration<Meta> {
	return template;
}

export interface TemplateDefinition extends TemplateDeclaration {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props vary per template
	component: Component<any>;
}

export type AttributeInputLoader = () => Promise<{ default: Component<AttributeInputProps> }>;

/** `() => import('@tiptap/extension-x')`: loaded only by editing surfaces, so the model stays server-safe. */
export type ExtensionLoader = () => Promise<AnyExtension | { default: AnyExtension }>;

export interface MarkDeclaration extends MarkDefinition {
	extension: ExtensionLoader;
	toolbar?: { label: string; icon?: BlockIcon };
}

/** A custom Mark: its editor extension, reader component and optional toolbar button. */
export function defineMark(mark: MarkDeclaration): MarkDeclaration {
	return mark;
}

/** A built-in toolbar id, a defined Mark's id, or a feature of your own. */
export type ToolbarItem = string | ToolbarFeature;

export const defaultToolbar: readonly string[] = [
	'bold',
	'italic',
	'strike',
	'code',
	'link',
	'heading2',
	'heading3',
	'heading4',
	'heading5',
	'heading6',
	'bulletList',
	'orderedList',
	'blockquote',
	'codeBlock',
	'horizontalRule'
];

export interface ContentModelOptions<Fields extends DocumentMetaSchema = DocumentMetaSchema> {
	base?: string;
	/** `import.meta.glob('./blocks/*.svelte', { eager: true })`, or definitions from `defineRuntimeBlock`. */
	blocks: Record<string, unknown> | BlockDefinition[];
	/** `import.meta.glob('./templates/*.svelte', { eager: true })`. */
	templates?: Record<string, unknown>;
	/** The fields every page has. */
	meta?: Fields;
	marks?: MarkDeclaration[];
	/** URLs of the renditions an image attribute declares, for the `Image` Field. */
	renditions?: RenditionResolver;
	editor?: {
		attributeInputs?: Record<string, AttributeInputLoader>;
		/** In display order. Defaults to `defaultToolbar` plus every Mark that declares `toolbar`. */
		toolbar?: readonly ToolbarItem[];
		extensions?: ExtensionLoader[];
	};
}

export interface ContentModel<Meta extends Record<string, unknown> = Record<string, unknown>> {
	base: string;
	blocks: BlockRegistry;
	meta: ReadonlyMap<string, AttributeSpec<unknown>>;
	marks: MarkDeclaration[];
	renditions?: RenditionResolver;
	/** The template `meta.template` names, else the first; undefined without templates. */
	templateFor(meta?: Record<string, unknown>): TemplateDefinition | undefined;
	schemaFor(meta?: Record<string, unknown>): ContentSchema<Meta>;
	editor: {
		attributeInputs: Record<string, AttributeInputLoader>;
		toolbar: readonly ToolbarItem[];
		extensions: ExtensionLoader[];
	};
}

function blockFromModule(key: string, module: unknown): BlockDefinition {
	const { block, default: component } = (module ?? {}) as {
		block?: BlockDeclaration;
		default?: SvelteBlockComponent;
	};
	if (!block) throw new Error(`Block module "${key}" has no \`block\` export`);
	return defineRuntimeBlock(svelteRuntime, { ...block, component });
}

function templateFromModule(key: string, module: unknown): TemplateDefinition {
	const { template, default: component } = (module ?? {}) as {
		template?: TemplateDeclaration;
		default?: Component;
	};
	if (!template) throw new Error(`Template module "${key}" has no \`template\` export`);
	return { ...template, component: component! };
}

export function createContentModel<Fields extends DocumentMetaSchema = DocumentMetaSchema>(
	options: ContentModelOptions<Fields>
): ContentModel<MetaValues<Fields>> {
	const definitions = Array.isArray(options.blocks)
		? options.blocks
		: Object.entries(options.blocks).map(([key, module]) => blockFromModule(key, module));
	const blocks = createBlockRegistry(definitions);
	const marks = options.marks ?? [];
	const allowedMarks = [...DEFAULT_MARKS, ...marks.map((mark) => mark.id)];
	const templates = Object.entries(options.templates ?? {}).map(([key, module]) =>
		templateFromModule(key, module)
	);
	const ids = templates.map((template) => template.id);
	const baseMeta: DocumentMetaSchema = { ...options.meta };
	if (templates.length > 1) {
		baseMeta.template = {
			default: ids[0],
			options: templates.map(({ id, label }) => ({ value: id, label })),
			validate: (value) => ids.includes(value as string)
		};
	}
	const schema = createSchema(blocks, { metaFields: baseMeta, allowedMarks });
	// One schema per template, so a caller re-deriving on every keystroke gets a stable reference.
	const schemas = new Map(
		templates.map((template) => [
			template.id,
			createSchema(blocks, {
				metaFields: { ...baseMeta, ...template.meta },
				allowedBlocks: template.allowedBlocks,
				allowedMarks
			})
		])
	);
	const templateFor = (meta?: Record<string, unknown>) =>
		templates.find((template) => template.id === meta?.template) ?? templates[0];

	return {
		base: options.base ?? '',
		blocks,
		meta: schema.metaFields,
		marks,
		renditions: options.renditions,
		templateFor,
		schemaFor: (meta) => {
			const template = templateFor(meta);
			return (template ? schemas.get(template.id)! : schema) as ContentSchema<MetaValues<Fields>>;
		},
		editor: {
			attributeInputs: options.editor?.attributeInputs ?? {},
			toolbar: options.editor?.toolbar ?? [
				...defaultToolbar,
				...marks.filter((mark) => mark.toolbar).map((mark) => mark.id)
			],
			extensions: options.editor?.extensions ?? []
		}
	};
}
