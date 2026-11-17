import type { ImageSource } from '../editor/imageSource.js';

export interface BlockSummary {
	type: string;
	attrs: Record<string, unknown>;
}

export interface BlockPage {
	path: string;
	template: string;
	meta: Record<string, unknown>;
}

/** What a Block knows about itself; identical in the Renderer and the editor except `editing`. */
export interface BlockContext<Attrs = Record<string, unknown>> {
	id: string;
	type: string;
	attrs: Attrs;
	editing: boolean;
	/** A no-op unless editing; one undo step per call. */
	update(patch: Partial<Attrs>): void;
	/** The nearest enclosing Block; null at top level. */
	parent: BlockSummary | null;
	/** Among the enclosing node's children. */
	index: number;
	siblings: ReadonlyArray<BlockSummary>;
	page: BlockPage;
	/** Null unless editing. */
	media: ImageSource | null;
}

export interface BlockEditorMountOptions {
	target: HTMLElement;
	inline: boolean;
	component: NormalizedBlockComponentDefinition;
	/**
	 * The ProseMirror-managed content host for container blocks (null for atomic
	 * blocks). Runtimes render this into the editor node view as the block's
	 * children slot. It is stable for the node view's lifetime, so it is only
	 * supplied at mount — never via `update()`.
	 */
	contentDOM?: HTMLElement | null;
	props: Record<string, unknown>;
	block: BlockContext;
	/** The `Editor`'s own Svelte context, for runtimes that can use it. */
	context?: Map<unknown, unknown>;
}

export interface BlockEditorMountHandle {
	destroy(): void;
	update?(props: Record<string, unknown>, block: BlockContext): void;
}

export interface NormalizedBlockComponentDefinition {
	runtime: string;
	component: unknown;
	plugin: BlockRuntimePlugin;
}

export interface BlockRuntimePlugin<Component = unknown> {
	/** Stable runtime id. Documents may only use blocks from one runtime in this release. */
	id: string;
	/** Normalize a native runtime component into a framework-neutral component definition. */
	defineComponent(component: Component): NormalizedBlockComponentDefinition;
	/** Mount, update, and destroy an editor node-view body for this runtime. */
	createEditorMount?(options: BlockEditorMountOptions): BlockEditorMountHandle;
	/** Reserved for future full-document single-runtime renderers with SSR support. */
	createRenderer?: unknown;
}
