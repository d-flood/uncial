import type { Component, Snippet } from 'svelte';
import type { PMDoc, PMPath } from '../shared/document.js';
import type { NormalizedBlockComponentDefinition } from './runtime.js';

export type AttrValidator<T> = (value: unknown) => value is T;
export type AttrParser<T> = (value: unknown) => T | undefined;
export type AttrSerializer = (value: unknown) => unknown;

export type AttributeInputKind =
	| 'text'
	| 'textarea'
	| 'number'
	| 'date'
	| 'datetime'
	| 'checkbox'
	| 'json'
	| 'list'
	| 'richtext'
	| 'select'
	| 'hidden'
	| 'image'
	| (string & {});

export interface AttributeOption<T> {
	value: T;
	label?: string;
	description?: string;
}

export type RichTextFeature =
	| 'bold'
	| 'italic'
	| 'strike'
	| 'code'
	| 'link'
	| 'heading'
	| 'bulletList'
	| 'orderedList'
	| 'blockquote'
	| 'codeBlock'
	| 'horizontalRule'
	| 'hardBreak';

export type RichTextFeatureSelection = '*' | '__all__' | RichTextFeature[];

/**
 * The shape of one item in a list-valued attribute, which the editor renders as
 * a stack of real fields with add/remove/reorder instead of raw JSON. Declare
 * `fields` for items that are records and `value` for items that are single
 * values; `defineBlock` and `createSchema` reject a list that declares neither.
 */
export interface AttributeListSpec {
	fields?: Record<string, AttributeConfig<unknown>>;
	value?: AttributeConfig<unknown>;
	/** Singular noun for one item, used in the add button and item controls. */
	itemLabel?: string;
}

export interface AttributeSpec<T> {
	default: T;
	required?: boolean;
	validate?: AttrValidator<T> | ((value: unknown) => boolean);
	parse?: AttrParser<T>;
	serialize?: AttrSerializer;
	input?: AttributeInputKind;
	/** The field's name in the editor; the attribute's own name when left out. */
	label?: string;
	placeholder?: string;
	/**
	 * Whether the editor shows the field, given the block's current attributes, or the document's
	 * metadata for a metadata field. Shown when left out; a hidden field keeps its value.
	 */
	when?: (attrs: Record<string, unknown>) => boolean;
	/** Advice shown under the field for a value that is valid but unwise; it never blocks a save. */
	warn?: (value: unknown) => string | null | undefined;
	/** IANA zone in which a `datetime` input shows and writes its wall clock; the browser's own by default. */
	timeZone?: string;
	options?: ReadonlyArray<T | AttributeOption<T>>;
	/** Item shape for an array-valued attribute; implies `input: 'list'`. */
	list?: AttributeListSpec;
	richText?: {
		features?: RichTextFeatureSelection;
		placeholder?: string;
	};
}

export type AttributeConfig<T> = AttributeSpec<T> | T;
export type MetaFieldSpec<T> = AttributeSpec<T>;
export type DocumentMetaSchema = Record<string, MetaFieldSpec<unknown>>;
export type MetaValues<Fields extends DocumentMetaSchema> = {
	[Name in keyof Fields]: Fields[Name]['default'];
};

export type BlockAttributes = Record<string, unknown>;
/**
 * A block's icon for editor UI (toolbar / insert menu). Either an icon name or
 * inline markup as a string, or a Svelte component/snippet that renders the
 * icon. (`string | unknown` collapsed to `unknown`, disabling type checking.)
 */
export type BlockIcon = string | Component | Snippet;
export type HtmlSpecValue = string | number | boolean | null | undefined;
export type HtmlSpec = [string, Record<string, unknown>?, ...(HtmlSpec | HtmlSpecValue)[]];
export type BlockHtmlRenderer = (attrs: BlockAttributes) => HtmlSpec;
export type BlockContentKind = 'flow';

export interface BlockContentDefinition {
	kind: BlockContentKind;
	/**
	 * Block ids this container admits as children, optionally beside prose
	 * nodes named in `PROSE_NODES` such as `paragraph` and `heading`. Omitted
	 * means unconstrained: every registered block is admissible. Every other id
	 * must name a block in the same registry; `createBlockRegistry` throws
	 * otherwise.
	 */
	allowedBlocks?: readonly string[];
}

export interface BlockComponentProps {
	content?: import('../shared/document.js').PMNode[];
	[name: string]: unknown;
}

export type NormalizedAttributes<Attrs extends BlockAttributes> = {
	[K in keyof Attrs]: AttributeSpec<Attrs[K]>;
};

export interface BlockComponents {
	editor: NormalizedBlockComponentDefinition;
	render: NormalizedBlockComponentDefinition;
}

export interface BlockBehavior {
	inline?: boolean;
	draggable?: boolean;
	selectable?: boolean;
}

export interface BaseBlockConfig<Attrs extends BlockAttributes> {
	id: string;
	label: string;
	description?: string;
	icon?: BlockIcon;
	/**
	 * The heading insert menus file the block under. Blocks of one group are listed together, and
	 * groups in the order their first block was registered.
	 */
	group?: string;
	/**
	 * Whether insert menus offer the block; `true` when left out. `false` keeps it valid and
	 * editable where it already is, and still offered by a container that names it in
	 * `content.allowedBlocks`: for blocks only another block holds, or that only an import or a
	 * developer places.
	 */
	insertable?: boolean;
	readOnly?: boolean;
	attributes: {
		[K in keyof Attrs]: AttributeConfig<Attrs[K]>;
	};
	behaviors?: BlockBehavior;
	content?: false | BlockContentDefinition;
	html?: {
		parseTag?: string;
		render?: BlockHtmlRenderer;
	};
}

export interface RuntimeBlockConfig<
	Attrs extends BlockAttributes,
	Component
> extends BaseBlockConfig<Attrs> {
	component?: Component;
	components?: {
		editor?: Component;
		render?: Component;
	};
}

export type BlockConfig<Attrs extends BlockAttributes> = RuntimeBlockConfig<Attrs, unknown>;

export interface BlockDefinition<Attrs extends BlockAttributes = BlockAttributes> {
	id: string;
	runtime: string;
	label: string;
	description?: string;
	icon?: BlockIcon;
	group?: string;
	insertable: boolean;
	readOnly: boolean;
	attributes: NormalizedAttributes<Attrs>;
	components: BlockComponents;
	behaviors: BlockBehavior;
	content?: BlockContentDefinition;
	html?: {
		parseTag?: string;
		render?: BlockHtmlRenderer;
	};
}

export interface BlockMetadata {
	id: string;
	label: string;
	description?: string;
	icon?: BlockIcon;
	group?: string;
	insertable: boolean;
}

export interface BlockRegistry {
	blocks: BlockDefinition[];
	byId: ReadonlyMap<string, BlockDefinition>;
	metadata: BlockMetadata[];
	get(id: string): BlockDefinition | undefined;
	has(id: string): boolean;
}

/**
 * Props a custom mark's render component receives: the mark's own attrs
 * spread as individual props, plus the marked text (and any marks nested
 * inside it) as children.
 */
export interface MarkComponentProps {
	children: Snippet;
	[name: string]: unknown;
}

export interface MarkDefinition {
	/** The ProseMirror mark type this renders, e.g. `superscript`. */
	id: string;
	component: Component<MarkComponentProps>;
}

export interface MarkRegistry {
	marks: MarkDefinition[];
	byId: ReadonlyMap<string, MarkDefinition>;
	get(id: string): MarkDefinition | undefined;
	has(id: string): boolean;
}

declare const metaValues: unique symbol;

export interface ContentSchema<Meta extends Record<string, unknown> = Record<string, unknown>> {
	allowedBlocks: ReadonlySet<string>;
	allowedMarks: ReadonlySet<string>;
	metaFields: ReadonlyMap<string, AttributeSpec<unknown>>;
	/** Never set: carries the meta type `createSchema` infers from `metaFields`. */
	readonly [metaValues]?: Meta;
}

export type ValidationCode =
	| 'UNKNOWN_BLOCK'
	| 'INVALID_ATTR'
	| 'INVALID_META'
	| 'UNKNOWN_META'
	| 'INVALID_CONTENT'
	| 'DISALLOWED_BLOCK'
	| 'DISALLOWED_MARK'
	| 'MALFORMED_NODE'
	| 'UNSUPPORTED_VERSION';

export interface ValidationIssue {
	code: ValidationCode;
	path: PMPath;
	message: string;
	severity: 'warning' | 'error';
	details?: Record<string, unknown>;
}

export interface ValidationResult {
	ok: boolean;
	issues: ValidationIssue[];
}

export interface CreateSchemaOptions<Fields extends DocumentMetaSchema = DocumentMetaSchema> {
	allowedBlocks?: string[];
	allowedMarks?: string[];
	metaFields?: Fields;
}

export interface ValidateDocumentOptions {
	onIssue?: (issue: ValidationIssue) => void;
}

export interface EditorIssueEvent {
	issue: ValidationIssue;
	source: 'editor' | 'render';
}

export interface EditorOptions {
	allowedMarks?: string[];
	onIssue?: (issue: ValidationIssue) => void;
}

export type ContentDocument = PMDoc;
