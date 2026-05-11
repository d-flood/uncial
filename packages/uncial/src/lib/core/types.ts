import type { PMDoc, PMPath } from '../shared/document.js';
import type { NormalizedBlockComponentDefinition } from './runtime.js';

export type AttrValidator<T> = (value: unknown) => value is T;
export type AttrParser<T> = (value: unknown) => T | undefined;
export type AttrSerializer = (value: unknown) => unknown;

export type AttributeInputKind =
	| 'text'
	| 'textarea'
	| 'number'
	| 'checkbox'
	| 'json'
	| 'richtext'
	| 'select'
	| 'hidden'
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

export interface AttributeSpec<T> {
	default: T;
	required?: boolean;
	validate?: AttrValidator<T> | ((value: unknown) => boolean);
	parse?: AttrParser<T>;
	serialize?: AttrSerializer;
	input?: AttributeInputKind;
	placeholder?: string;
	options?: ReadonlyArray<T | AttributeOption<T>>;
	richText?: {
		features?: RichTextFeatureSelection;
		placeholder?: string;
	};
}

export type AttributeConfig<T> = AttributeSpec<T> | T;

export type BlockAttributes = Record<string, unknown>;
export type BlockIcon = string | unknown;
export type HtmlSpecValue = string | number | boolean | null | undefined;
export type HtmlSpec = [string, Record<string, unknown>?, ...(HtmlSpec | HtmlSpecValue)[]];
export type BlockHtmlRenderer = (attrs: BlockAttributes) => HtmlSpec;
export type BlockContentKind = 'flow';

export interface BlockContentDefinition {
	kind: BlockContentKind;
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

export interface RuntimeBlockConfig<Attrs extends BlockAttributes, Component>
	extends BaseBlockConfig<Attrs> {
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
}

export interface BlockRegistry {
	blocks: BlockDefinition[];
	byId: ReadonlyMap<string, BlockDefinition>;
	metadata: BlockMetadata[];
	get(id: string): BlockDefinition | undefined;
	has(id: string): boolean;
}

export interface ContentSchema {
	allowedBlocks: ReadonlySet<string>;
	allowedMarks: ReadonlySet<string>;
}

export type ValidationCode =
	| 'UNKNOWN_BLOCK'
	| 'INVALID_ATTR'
	| 'INVALID_CONTENT'
	| 'DISALLOWED_BLOCK'
	| 'DISALLOWED_MARK'
	| 'MALFORMED_NODE';

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

export interface CreateSchemaOptions {
	allowedBlocks?: string[];
	allowedMarks?: string[];
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
