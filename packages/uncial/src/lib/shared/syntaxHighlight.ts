import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import { createLowlight } from 'lowlight';

type HighlightNode = {
	type?: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: HighlightNode[];
};

/**
 * Registered grammars, named one by one rather than lowlight's `common` set.
 *
 * `common` is 37 grammars and about 172 KB minified, and it lands in the chunk
 * every page rendering a document hydrates — including pages that contain no
 * code at all. These are the languages the alias table below maps, which is the
 * set this renderer can actually name.
 *
 * `plaintext` is registered for the opposite reason to the rest: it matches
 * nothing, and that is its job. An unregistered language falls to
 * `highlightAuto`, so a block declared `plaintext` — console output, a directory
 * tree, a licence key — would be guessed at and coloured, which is precisely
 * what declaring it asks the renderer not to do.
 */
export const lowlight = createLowlight({
	bash,
	css,
	javascript,
	json,
	plaintext,
	python,
	typescript,
	xml
});

lowlight.registerAlias({
	javascript: ['js', 'jsx'],
	python: ['py'],
	typescript: ['ts', 'tsx'],
	// Vue single-file components are XML-shaped, and naming the alias keeps them
	// off the auto-detect path, whose guess narrowed with the registry above.
	xml: ['html', 'svelte', 'vue']
});

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function normalizeLanguage(language: unknown): string | undefined {
	return typeof language === 'string' && language.trim()
		? language.trim().toLowerCase()
		: undefined;
}

function renderHighlightedNode(node: HighlightNode): string {
	if (node.type === 'text') {
		return escapeHtml(node.value ?? '');
	}

	if (node.type !== 'element' || node.tagName !== 'span') {
		return (node.children ?? []).map(renderHighlightedNode).join('');
	}

	const className = node.properties?.className;
	const classes = Array.isArray(className)
		? className.filter((value): value is string => typeof value === 'string')
		: [];
	const attrs = classes.length ? ` class="${escapeHtml(classes.join(' '))}"` : '';
	const children = (node.children ?? []).map(renderHighlightedNode).join('');

	return `<span${attrs}>${children}</span>`;
}

export function getCodeLanguageClass(language: unknown): string {
	const normalized = normalizeLanguage(language);
	return normalized ? `language-${normalized}` : '';
}

export function highlightCodeToHtml(code: string, language: unknown): string {
	const normalized = normalizeLanguage(language);
	const tree =
		normalized && lowlight.registered(normalized)
			? lowlight.highlight(normalized, code)
			: lowlight.highlightAuto(code);

	return (tree.children as HighlightNode[]).map(renderHighlightedNode).join('');
}
