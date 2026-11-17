/**
 * The signed-in forge the Site's image and file sources upload through, so
 * they need no adapter threaded into every editing surface.
 *
 * It is a single last-writer-wins slot: one page hosts one editor at a time.
 * `createEditorController` and the Dashboard set it; editing surfaces clear it
 * on teardown.
 */
import type { ForgeAdapter, UncialCmsSiteConfig } from './types.js';

export interface ActiveForge {
	adapter: ForgeAdapter;
	author: { name: string; email: string };
	/** The session's site config, so an upload can default its `mediaDir`. */
	config: UncialCmsSiteConfig;
}

let active: ActiveForge | null = null;

export function setActiveForge(forge: ActiveForge): void {
	active = forge;
}

export function clearActiveForge(): void {
	active = null;
}

export function getActiveForge(): ActiveForge | null {
	return active;
}

/** The git forges commit media under `mediaDir`; the server forge has none. */
export function configMediaDir(config: UncialCmsSiteConfig): string | undefined {
	return config.forge === 'server' ? undefined : config.mediaDir;
}

export function configMediaUrlPrefix(config: UncialCmsSiteConfig): string | undefined {
	return config.forge === 'server' ? undefined : config.mediaUrlPrefix;
}
