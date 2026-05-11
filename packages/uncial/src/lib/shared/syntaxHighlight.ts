import { common, createLowlight } from 'lowlight';

type HighlightNode = {
	type?: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: HighlightNode[];
};

export const lowlight = createLowlight(common);

lowlight.registerAlias({
	javascript: ['js', 'jsx'],
	python: ['py'],
	typescript: ['ts', 'tsx'],
	xml: ['html', 'svelte']
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
