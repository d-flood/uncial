import adapter from '@sveltejs/adapter-static';
import { common, createLowlight } from 'lowlight';
import { mdsvex } from 'mdsvex';

const lowlight = createLowlight(common);

lowlight.registerAlias({
	javascript: ['js', 'jsx'],
	typescript: ['ts', 'tsx'],
	xml: ['html', 'svelte']
});

function escapeHtml(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/{/g, '&#123;')
		.replace(/}/g, '&#125;');
}

function renderHighlightedNode(node) {
	if (node.type === 'text') return escapeHtml(node.value ?? '');

	if (node.type !== 'element' || node.tagName !== 'span') {
		return (node.children ?? []).map(renderHighlightedNode).join('');
	}

	const className = node.properties?.className;
	const classes = Array.isArray(className)
		? className.filter((value) => typeof value === 'string')
		: [];
	const attrs = classes.length ? ` class="${escapeHtml(classes.join(' '))}"` : '';
	const children = (node.children ?? []).map(renderHighlightedNode).join('');

	return `<span${attrs}>${children}</span>`;
}

function normalizeLanguage(language) {
	return typeof language === 'string' && language.trim()
		? language.trim().toLowerCase()
		: undefined;
}

function highlightCode(code, language) {
	const normalized = normalizeLanguage(language);
	const tree =
		normalized && lowlight.registered(normalized)
			? lowlight.highlight(normalized, code)
			: lowlight.highlightAuto(code);
	const highlighted = tree.children.map(renderHighlightedNode).join('');
	const languageClass = normalized ? ` language-${escapeHtml(normalized)}` : '';

	return `<pre><code class="hljs${languageClass}">${highlighted}</code></pre>`;
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.md'],
	preprocess: [mdsvex({ extensions: ['.md'], highlight: { highlighter: highlightCode } })],
	kit: {
		adapter: adapter({
			fallback: '404.html'
		}),
		paths: {
			base: process.argv.includes('dev') ? '' : (process.env.BASE_PATH ?? '')
		}
	}
};

export default config;
