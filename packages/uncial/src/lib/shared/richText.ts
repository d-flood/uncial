import type { RichTextFeature, RichTextFeatureSelection } from '../core/types.js';
import type { PMDoc, PMNode } from './document.js';
import { isPlainObject as isRecord } from './guards.js';

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

// `resolveRichTextFeatures` runs inside reactive `$derived`s, so an unsupported
// feature would otherwise warn on every re-render. Warn once per process per
// feature instead.
const warnedUnsupportedFeatures = new Set<string>();

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
	// Sound narrowing: only report `true` (and narrow to `PMDoc`) when the value
	// really is a rich-text document that contains visible text. A bare string
	// has visible text but is NOT a `PMDoc`, so narrowing it to `PMDoc` was
	// unsound; such inputs now return `false`.
	return isRichTextDocument(value) && hasNodeText(value.content ?? []);
}

export function resolveRichTextFeatures(
	features?: RichTextFeatureSelection
): ReadonlySet<RichTextFeature> {
	if (features === '*' || features === '__all__') return new Set(runtimeRichTextFeatures);
	if (!Array.isArray(features)) return new Set(defaultRichTextFeatures);

	// `link` is not a rich-text attribute feature: the rich-text runtime
	// (`createRichTextExtensions`) intentionally ships no link mark or link UI.
	// Rather than dropping an explicitly-requested `'link'` silently, warn so the
	// misconfiguration is visible instead of a link that never appears.
	if (features.includes('link') && !warnedUnsupportedFeatures.has('link')) {
		warnedUnsupportedFeatures.add('link');
		console.warn(
			"resolveRichTextFeatures: the 'link' feature is not supported in rich-text " +
				'attribute editors and was ignored. Remove it from the feature list, or use a ' +
				'full block/link mark for linkable content.'
		);
	}

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
