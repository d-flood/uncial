import type { Component, Snippet } from 'svelte';
import type { BlockRuntimePlugin } from '../core/runtime.js';
import { SVELTE_RUNTIME_ID } from '../shared/runtimeId.js';

export { SVELTE_RUNTIME_ID };

export interface SvelteBlockComponentProps {
	content?: unknown[];
	children?: Snippet;
	[name: string]: unknown;
}

export type SvelteBlockComponent = Component<Record<string, unknown>>;

// Omits `createEditorMount` so defining a Block stays server-safe; the editor mounts this runtime itself.
export const svelteRuntime: BlockRuntimePlugin<SvelteBlockComponent> = {
	id: SVELTE_RUNTIME_ID,
	defineComponent(component) {
		return { runtime: SVELTE_RUNTIME_ID, component, plugin: svelteRuntime };
	}
};
