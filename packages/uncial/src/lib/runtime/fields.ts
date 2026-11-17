import { DEV } from 'esm-env';
import { getContext, setContext, type Component } from 'svelte';
import type { BlockContext } from '../core/runtime.js';
import type {
	AttributeSpec,
	BlockRegistry,
	RenditionResolver,
	RichTextFeatureSelection
} from '../core/types.js';
import type { ImageSource } from '../editor/imageSource.js';
import { BLOCK_CONTEXT } from './blockContext.js';

/** The values a Field component reads by name: a Block's attributes, or the page's metadata. */
export interface FieldScope {
	readonly editing: boolean;
	readonly base: string;
	readonly media: ImageSource | null;
	has(name: string): boolean;
	spec(name: string): AttributeSpec<unknown> | undefined;
	value(name: string): unknown;
	/** One normalized, undoable commit; a no-op unless editing. */
	set(name: string, value: unknown): void;
}

export interface FieldEditorProps {
	scope: FieldScope;
	name: string;
}

/** The editing behaviour of each Field component, which the `Editor` injects. */
export interface FieldEditors {
	text: Component<FieldEditorProps>;
	richText: Component<FieldEditorProps & { features?: RichTextFeatureSelection }>;
	/** Takes the `<img>` attributes the reader would render. */
	image: Component<FieldEditorProps & { alt?: string } & Record<string, unknown>>;
}

/** What a surface (Renderer, Page, Editor) supplies to the Field components inside it. */
export interface FieldHost {
	readonly base: string;
	readonly registry?: BlockRegistry;
	readonly renditions?: RenditionResolver;
	readonly page: FieldScope;
	readonly editors?: FieldEditors;
}

const FIELD_HOST = Symbol('uncial.fields');

export function setFieldHost(host: FieldHost): void {
	setContext(FIELD_HOST, host);
}

export function getFieldHost(): FieldHost | undefined {
	return getContext<FieldHost | undefined>(FIELD_HOST);
}

export function metaScope(options: {
	editing?: boolean;
	base: () => string;
	media?: () => ImageSource | null;
	values: () => Record<string, unknown>;
	specs: () => ReadonlyMap<string, AttributeSpec<unknown>>;
	set?: (name: string, value: unknown) => void;
}): FieldScope {
	return {
		editing: options.editing ?? false,
		get base() {
			return options.base();
		},
		get media() {
			return options.media?.() ?? null;
		},
		has: (name) => options.specs().has(name) || name in options.values(),
		spec: (name) => options.specs().get(name),
		value: (name) => options.values()[name] ?? options.specs().get(name)?.default,
		set: (name, value) => options.set?.(name, value)
	};
}

function blockScope(block: BlockContext, host: FieldHost | undefined): FieldScope {
	const attrs = () => block.attrs as Record<string, unknown>;
	return {
		get editing() {
			return block.editing;
		},
		get base() {
			return host?.base ?? '';
		},
		get media() {
			return block.media;
		},
		has: (name) => name in attrs(),
		spec: (name) => host?.registry?.get(block.type)?.attributes[name],
		value: (name) => attrs()[name],
		set: (name, value) => block.update({ [name]: value })
	};
}

const warned = new Set<string>();

/** The Field scope of the calling component: its Block's attributes inside a Block, else the page's metadata. */
export function useField(name: () => string): {
	readonly scope: FieldScope | undefined;
	readonly editors: FieldEditors | undefined;
} {
	const host = getFieldHost();
	const block = getContext<BlockContext | undefined>(BLOCK_CONTEXT);
	const scope = block ? blockScope(block, host) : host?.page;
	return {
		get scope() {
			const known = scope?.has(name());
			if (!known && DEV && !warned.has(name())) {
				warned.add(name());
				console.warn(`uncial: no field named "${name()}" in this ${block ? 'Block' : 'page'}`);
			}
			return known ? scope : undefined;
		},
		get editors() {
			return scope?.editing ? host?.editors : undefined;
		}
	};
}
