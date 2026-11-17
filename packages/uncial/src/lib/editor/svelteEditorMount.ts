import { createRawSnippet, mount, unmount } from 'svelte';
import type { Snippet } from 'svelte';
import type { BlockEditorMountHandle, BlockEditorMountOptions } from '../core/runtime.js';
import type { SvelteBlockComponent } from '../runtime/svelte.js';
import { SVELTE_RUNTIME_ID } from '../shared/runtimeId.js';
import { BLOCK_CONTEXT } from '../runtime/blockContext.js';
import BlockNodeView from './BlockNodeView.svelte';
import { createReactiveProps } from './reactiveProps.svelte.js';

type MountedComponent = ReturnType<typeof mount>;

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

export function mountSvelteBlock(options: BlockEditorMountOptions): BlockEditorMountHandle {
	if (options.component.runtime !== SVELTE_RUNTIME_ID) {
		throw new Error('Svelte runtime can only mount Svelte block components');
	}

	const host = document.createElement(options.inline ? 'span' : 'div');
	host.className = 'uncial-nodeview-host';
	options.target.replaceChildren(host);

	const component = options.component.component as SvelteBlockComponent;
	const children = createContentSnippet(options.contentDOM ?? null);
	const reactiveProps = createReactiveProps({
		...options.props,
		component,
		children
	});
	const block = createReactiveProps({ ...options.block });

	let mounted: MountedComponent | null = mount(BlockNodeView, {
		target: host,
		props: reactiveProps.props as unknown as Parameters<typeof BlockNodeView>[1],
		context: new Map([...(options.context ?? []), [BLOCK_CONTEXT, block.props]])
	});

	return {
		destroy() {
			if (mounted) {
				void unmount(mounted);
				mounted = null;
			}
		},
		update(nextProps, nextBlock) {
			if (!mounted) return;
			block.update({ ...nextBlock });
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
