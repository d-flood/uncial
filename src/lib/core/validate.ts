import type { PMDoc, PMMark, PMNode, PMPath } from '../shared/document.js';
import type {
	AttributeSpec,
	BlockDefinition,
	ContentSchema,
	ValidateDocumentOptions,
	ValidationIssue,
	ValidationResult
} from './types.js';
import { resolveRegistry } from './registry.js';

const BUILTIN_NODE_TYPES = new Set([
	'doc',
	'paragraph',
	'text',
	'heading',
	'blockquote',
	'codeBlock',
	'horizontalRule',
	'hardBreak',
	'bulletList',
	'orderedList',
	'listItem'
]);

function pushIssue(
	issues: ValidationIssue[],
	options: ValidateDocumentOptions | undefined,
	issue: ValidationIssue
): void {
	issues.push(issue);
	options?.onIssue?.(issue);
}

function validateMarks(
	marks: PMMark[] | undefined,
	path: PMPath,
	schema: ContentSchema,
	issues: ValidationIssue[],
	options?: ValidateDocumentOptions
): void {
	if (!marks) return;

	marks.forEach((mark, markIndex) => {
		if (!mark?.type || typeof mark.type !== 'string') {
			pushIssue(issues, options, {
				code: 'MALFORMED_NODE',
				path: [...path, 'marks', markIndex],
				message: 'Mark is malformed',
				severity: 'error'
			});
			return;
		}

		if (!schema.allowedMarks.has(mark.type)) {
			pushIssue(issues, options, {
				code: 'DISALLOWED_MARK',
				path: [...path, 'marks', markIndex],
				message: `Mark "${mark.type}" is not allowed by this schema`,
				severity: 'error',
				details: { mark: mark.type }
			});
		}
	});
}

function validateBlockAttrs(
	node: PMNode,
	block: BlockDefinition,
	path: PMPath,
	issues: ValidationIssue[],
	options?: ValidateDocumentOptions
): void {
	const attrs = node.attrs ?? {};

	for (const [name, spec] of Object.entries(block.attributes) as [
		string,
		AttributeSpec<unknown>
	][]) {
		const value = attrs[name];
		const missing = value === undefined || value === null;

		if (missing && spec.required) {
			pushIssue(issues, options, {
				code: 'INVALID_ATTR',
				path: [...path, 'attrs', name],
				message: `Required attribute "${name}" is missing for block "${block.id}"`,
				severity: 'error'
			});
			continue;
		}

		if (missing) continue;

		if (spec.validate && !spec.validate(value)) {
			pushIssue(issues, options, {
				code: 'INVALID_ATTR',
				path: [...path, 'attrs', name],
				message: `Attribute "${name}" is invalid for block "${block.id}"`,
				severity: 'error',
				details: { value }
			});
		}
	}
}

function validateNode(
	node: PMNode,
	path: PMPath,
	registryBlocks: Map<string, BlockDefinition>,
	schema: ContentSchema,
	issues: ValidationIssue[],
	options?: ValidateDocumentOptions
): void {
	if (!node || typeof node.type !== 'string') {
		pushIssue(issues, options, {
			code: 'MALFORMED_NODE',
			path,
			message: 'Node is malformed',
			severity: 'error'
		});
		return;
	}

	validateMarks(node.marks, path, schema, issues, options);

	const block = registryBlocks.get(node.type);
	const isKnownBuiltin = BUILTIN_NODE_TYPES.has(node.type);

	if (block) {
		if (!schema.allowedBlocks.has(block.id)) {
			pushIssue(issues, options, {
				code: 'DISALLOWED_BLOCK',
				path,
				message: `Block "${block.id}" is not allowed by this schema`,
				severity: 'error',
				details: { block: block.id }
			});
		}
		validateBlockAttrs(node, block, path, issues, options);
	} else if (!isKnownBuiltin) {
		pushIssue(issues, options, {
			code: 'UNKNOWN_BLOCK',
			path,
			message: `Unknown block/node type "${node.type}"`,
			severity: 'warning',
			details: { block: node.type }
		});
	}

	if (node.type === 'text' && typeof node.text !== 'string') {
		pushIssue(issues, options, {
			code: 'MALFORMED_NODE',
			path: [...path, 'text'],
			message: 'Text node is missing text value',
			severity: 'error'
		});
	}

	if (node.content && !Array.isArray(node.content)) {
		pushIssue(issues, options, {
			code: 'MALFORMED_NODE',
			path: [...path, 'content'],
			message: 'Node content must be an array when present',
			severity: 'error'
		});
		return;
	}

	node.content?.forEach((child: PMNode, index: number) => {
		validateNode(child, [...path, 'content', index], registryBlocks, schema, issues, options);
	});
}

export function validateDocument(
	document: PMDoc,
	blocks: Parameters<typeof resolveRegistry>[0],
	schema: ContentSchema,
	options?: ValidateDocumentOptions
): ValidationResult {
	const registry = resolveRegistry(blocks);
	const issues: ValidationIssue[] = [];

	if (!document || document.type !== 'doc') {
		pushIssue(issues, options, {
			code: 'MALFORMED_NODE',
			path: [],
			message: 'Document root must be a ProseMirror doc node',
			severity: 'error'
		});
		return { ok: false, issues };
	}

	if (document.content && !Array.isArray(document.content)) {
		pushIssue(issues, options, {
			code: 'MALFORMED_NODE',
			path: ['content'],
			message: 'Document content must be an array when present',
			severity: 'error'
		});
		return { ok: false, issues };
	}

	const registryBlocks = new Map<string, BlockDefinition>(
		registry.blocks.map((block: BlockDefinition) => [block.id, block] as const)
	);
	document.content?.forEach((node: PMNode, index: number) => {
		validateNode(node, ['content', index], registryBlocks, schema, issues, options);
	});

	return {
		ok: !issues.some((issue) => issue.severity === 'error'),
		issues
	};
}
