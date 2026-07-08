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
import { createReactiveProps } from './reactiveProps.svelte.js';
import { SVELTE_RUNTIME_ID } from '../shared/runtimeId.js';

// Re-exported so `uncial/runtime/svelte` consumers keep the same public surface.
export { SVELTE_RUNTIME_ID };

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

		const component = options.component.component;
		// Prefer the first-class `contentDOM` option; fall back to the legacy
		// `props.contentDOM` key for one release for any external caller still
		// passing it that way.
		const contentDOM =
			options.contentDOM ?? (options.props.contentDOM as HTMLElement | null) ?? null;
		const children = createContentSnippet(contentDOM);
		const reactiveProps = createReactiveProps({
			...options.props,
			component,
			children
		});

		let mounted: MountedComponent | null = mount(BlockNodeView, {
			target: host,
			props: reactiveProps.props as unknown as Parameters<typeof BlockNodeView>[1]
		});

		return {
			destroy() {
				if (mounted) {
					void unmount(mounted);
					mounted = null;
				}
			},
			update(nextProps) {
				if (!mounted) return;
				// Keep the component identity and the content snippet stable so the
				// mounted component (and its contentDOM) survives attribute updates.
				reactiveProps.update({
					...nextProps,
					component,
					children
				});
			}
		};
	}
};

export function defineSvelteBlock<Attrs extends BlockAttributes>(
	config: RuntimeBlockConfig<Attrs, SvelteBlockComponent>
) {
	return defineRuntimeBlock(svelteRuntime, config);
}
