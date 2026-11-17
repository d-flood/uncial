import { render } from 'svelte/server';
import type { ContentDocument } from '../core/types.js';
import { createContentModel, type ContentModel } from '../model.js';
import type { PMNode } from '../shared/document.js';
import { coerceRichTextDocument } from '../shared/richText.js';
import Renderer from './Renderer.svelte';

/** The `Renderer`'s HTML for a document or rich-text value. Server and build time only. */
export function toHtml(content: ContentDocument | string, model?: ContentModel): string {
	const { body } = render(Renderer, {
		props: {
			content: coerceRichTextDocument(content),
			model: model ?? createContentModel({ blocks: [] })
		}
	});
	// Svelte renders no comments of its own, only hydration markers.
	return body.replace(/<!--[\s\S]*?-->/g, '');
}

/** The text of a document or rich-text value, one space between blocks, whitespace collapsed. */
export function toPlainText(content: ContentDocument | string): string {
	const parts: string[] = [];
	const walk = (node: PMNode) => {
		if (typeof node.text === 'string') return void parts.push(node.text);
		parts.push(' ');
		node.content?.forEach(walk);
		parts.push(' ');
	};
	walk(coerceRichTextDocument(content));
	return parts.join('').replace(/\s+/g, ' ').trim();
}
