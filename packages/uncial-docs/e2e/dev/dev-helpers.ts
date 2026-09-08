import { readFileSync, writeFileSync } from 'node:fs';

/**
 * The dev-server suite edits the real documents under content/docs/ through the
 * local forge, which is the whole point: `vite dev` writes the checkout. Every
 * test that touches one restores it in a `finally`.
 */

/** Playwright runs from the package root, where `site.localContentDir` resolves. */
export const GETTING_STARTED_FILE = 'content/docs/getting-started.json';

export const GETTING_STARTED_TEXT = 'Your presentation layer is the editor';

export function readDoc(file: string): string {
	return readFileSync(file, 'utf-8');
}

export function restoreDoc(file: string, content: string): void {
	writeFileSync(file, content);
}
