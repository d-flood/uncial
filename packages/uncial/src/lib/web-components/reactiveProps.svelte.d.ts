/**
 * Creates a deeply reactive props object for imperative `mount(...)` calls.
 *
 * Svelte runes are only available in `.svelte`/`.svelte.ts` modules, so this
 * helper lets the plain TypeScript custom-element module own a `$state`-backed
 * object. Mutating the returned proxy updates the mounted component's props in
 * place instead of requiring a destroy/remount cycle, and `$bindable` props
 * written by the component are reflected back onto the same object.
 */
export declare function reactiveProps<Props extends Record<string, unknown>>(initial: Props): Props;
