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
}

export interface BlockEditorMountHandle {
	destroy(): void;
	update?(props: Record<string, unknown>): void;
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
