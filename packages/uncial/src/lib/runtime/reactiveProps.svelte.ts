/**
 * `$state`-backed props for imperatively mounted Svelte components.
 *
 * `mount(Component, { props })` only propagates later prop changes when the
 * props object is reactive, so this helper wraps the initial props in `$state`
 * and exposes an `update()` that mutates the object in place. Runes are only
 * available in `.svelte.ts` modules, which is why this lives outside
 * `runtime/svelte.ts`.
 */
export interface ReactivePropsHandle {
	/** The `$state`-backed props object to pass to `mount()`. */
	props: Record<string, unknown>;
	/** Mutates `props` in place so it exactly matches `next`. */
	update(next: Record<string, unknown>): void;
}

export function createReactiveProps(initial: Record<string, unknown>): ReactivePropsHandle {
	const props: Record<string, unknown> = $state({ ...initial });

	return {
		props,
		update(next: Record<string, unknown>) {
			for (const [key, value] of Object.entries(next)) {
				props[key] = value;
			}
			for (const key of Object.keys(props)) {
				if (!(key in next)) {
					delete props[key];
				}
			}
		}
	};
}
