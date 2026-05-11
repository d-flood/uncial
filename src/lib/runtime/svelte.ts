import { createRawSnippet, mount, unmount } from 'svelte';
import type { Component, Snippet } from 'svelte';
import { defineRuntimeBlock } from '../core/defineBlock.js';
import type {
	BlockEditorMountHandle,
	BlockEditorMountOptions,
	BlockRuntimePlugin,
	NormalizedBlockComponentDefinition
} from '../core/runtime.js';
import type { BlockAttributes, RuntimeBlockConfig } from '../core/types.js';
import BlockNodeView from '../editor/BlockNodeView.svelte';

export const SVELTE_RUNTIME_ID = 'svelte';

export interface SvelteBlockComponentProps {
	content?: unknown[];
	children?: Snippet;
	[name: string]: unknown;
}

export type SvelteBlockComponent = Component<Record<string, unknown>>;

type MountedComponent = ReturnType<typeof mount>;

function isSvelteComponentDefinition(
	definition: NormalizedBlockComponentDefinition
): definition is NormalizedBlockComponentDefinition & { component: SvelteBlockComponent } {
	return definition.runtime === SVELTE_RUNTIME_ID;
}

function createContentSnippet(contentDOM: HTMLElement | null): Snippet | undefined {
	return contentDOM
		? createRawSnippet(() => ({
				render: () => '<div class="uncial-nodeview-content"></div>',
				setup: (element) => {
					element.replaceChildren(contentDOM);
				}
			}))
		: undefined;
}

export const svelteRuntime: BlockRuntimePlugin<SvelteBlockComponent> = {
	id: SVELTE_RUNTIME_ID,
	defineComponent(component) {
		return { runtime: SVELTE_RUNTIME_ID, component, plugin: svelteRuntime };
	},
	createEditorMount(options: BlockEditorMountOptions): BlockEditorMountHandle {
		if (!isSvelteComponentDefinition(options.component)) {
			throw new Error('Svelte runtime can only mount Svelte block components');
		}

		const host = document.createElement(options.inline ? 'span' : 'div');
		host.className = 'uncial-nodeview-host';
		options.target.replaceChildren(host);

		const props = {
			...options.props,
			component: options.component.component,
			children: createContentSnippet((options.props.contentDOM as HTMLElement | null) ?? null)
		};

		let mounted: MountedComponent | null = mount(BlockNodeView, {
			target: host,
			props: props as Parameters<typeof BlockNodeView>[1]
		});

		return {
			destroy() {
				if (mounted) {
					void unmount(mounted);
					mounted = null;
				}
			}
		};
	}
};

export function defineSvelteBlock<Attrs extends BlockAttributes>(
	config: RuntimeBlockConfig<Attrs, SvelteBlockComponent>
) {
	return defineRuntimeBlock(svelteRuntime, config);
}
