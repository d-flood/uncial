import type { ContentDocument, ContentSchema } from 'uncial/core';
import type { Site } from './define-site.js';

export const GLOBALS_DIR = '_globals';
export const GLOBAL_KIND = 'global';

export type GlobalValue<S extends Site, N extends keyof S['globals']> =
	S['globals'][N] extends ContentSchema<infer Meta> ? Meta : never;

export const GLOBAL_NAME = /^[A-Za-z0-9_-]+$/;

function checkName(name: string): string {
	if (!GLOBAL_NAME.test(name)) {
		throw new Error(`"${name}" is not a Global name: use letters, digits, "-" and "_".`);
	}
	return name;
}

export function globalSourcePath(contentDir: string, name: string): string {
	return `${contentDir}/${GLOBALS_DIR}/${checkName(name)}.json`;
}

export function globalRecordPath(name: string): string {
	return `/${GLOBALS_DIR}/${checkName(name)}/`;
}

export function isGlobalsPath(path: string): boolean {
	return path.replace(/^\/+/, '').split('/')[0] === GLOBALS_DIR;
}

export function assertPagePath(path: string): void {
	if (isGlobalsPath(path)) throw new Error('The _globals namespace is reserved for Globals.');
}

export function globalTitle(schema: ContentSchema): string | undefined {
	const title = (schema as { title?: unknown }).title;
	return typeof title === 'string' && title !== '' ? title : undefined;
}

export function globalDocument(value: Record<string, unknown>): ContentDocument {
	return { type: 'doc', content: [], meta: value };
}
