import type { RichTextFeature, RichTextFeatureSelection } from '../core/types.js';
import type { PMDoc, PMNode } from './document.js';

export const supportedRichTextFeatures = [
	'bold',
	'italic',
	'strike',
	'code',
	'link',
	'heading',
	'bulletList',
	'orderedList',
	'blockquote',
	'codeBlock',
	'horizontalRule',
	'hardBreak'
] as const satisfies readonly RichTextFeature[];

export const runtimeRichTextFeatures = supportedRichTextFeatures.filter(
	(feature) => feature !== 'link'
);

const defaultRichTextFeatures = [
	'bold',
	'italic',
	'bulletList',
	'orderedList',
	'hardBreak'
] as const satisfies readonly RichTextFeature[];

const supportedFeatureSet = new Set<string>(supportedRichTextFeatures);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPMNode(value: unknown): value is PMNode {
	if (!isRecord(value) || typeof value.type !== 'string') return false;
	if (value.content !== undefined && !Array.isArray(value.content)) return false;
	if (value.marks !== undefined && !Array.isArray(value.marks)) return false;
	return true;
}

export function emptyRichTextDocument(): PMDoc {
	return { type: 'doc', content: [] };
}

export function richTextDocument(text = ''): PMDoc {
	if (!text.trim()) return emptyRichTextDocument();

	return {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	};
}

export function isRichTextDocument(value: unknown): value is PMDoc {
	return (
		isRecord(value) &&
		value.type === 'doc' &&
		(value.content === undefined || Array.isArray(value.content))
	);
}

export function coerceRichTextDocument(value: unknown): PMDoc {
	if (value === undefined || value === null || value === '') return emptyRichTextDocument();
	if (isRichTextDocument(value)) return value;

	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			if (isRichTextDocument(parsed)) return parsed;
		} catch {
			// Plain strings are valid rich text input.
		}

		return richTextDocument(value);
	}

	return emptyRichTextDocument();
}

function hasNodeText(nodes: PMNode[] = []): boolean {
	return nodes.some((node) => {
		if (typeof node.text === 'string' && node.text.trim().length > 0) return true;
		return Array.isArray(node.content) && hasNodeText(node.content);
	});
}

export function hasRichTextContent(value: unknown): value is PMDoc {
	return hasNodeText(coerceRichTextDocument(value).content ?? []);
}

export function resolveRichTextFeatures(
	features?: RichTextFeatureSelection
): ReadonlySet<RichTextFeature> {
	if (features === '*' || features === '__all__') return new Set(runtimeRichTextFeatures);
	if (!Array.isArray(features)) return new Set(defaultRichTextFeatures);

	return new Set(
		features.filter(
			(feature): feature is RichTextFeature =>
				typeof feature === 'string' && supportedFeatureSet.has(feature) && feature !== 'link'
		)
	);
}

export function filterRichTextNodes(
	nodes: PMNode[] = [],
	features: ReadonlySet<RichTextFeature>
): PMNode[] {
	return nodes.flatMap((node) => {
		if (!isPMNode(node) || !isRichTextNodeAllowed(node, features)) return [];

		return [
			{
				...node,
				marks: node.marks?.filter((mark) => features.has(mark.type as RichTextFeature)),
				content: node.content ? filterRichTextNodes(node.content, features) : undefined
			}
		];
	});
}

function isRichTextNodeAllowed(node: PMNode, features: ReadonlySet<RichTextFeature>): boolean {
	if (
		node.type === 'doc' ||
		node.type === 'paragraph' ||
		node.type === 'text' ||
		node.type === 'listItem'
	) {
		return true;
	}

	return features.has(node.type as RichTextFeature);
}
