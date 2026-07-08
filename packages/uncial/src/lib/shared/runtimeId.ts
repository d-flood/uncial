/**
 * Identifier for the built-in Svelte block runtime.
 *
 * This lives in a dependency-free leaf module so SSR/render consumers can compare
 * against it without importing `runtime/svelte.ts`, which pulls in the editor mount
 * stack (Tiptap `BlockNodeView`, Svelte `mount`/`unmount`, reactive props).
 */
export const SVELTE_RUNTIME_ID = 'svelte';
