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
import { validateMeta } from './meta.js';
import { pushIssue } from './issues.js';
import { CURRENT_DOCUMENT_VERSION } from './migrations.js';

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

function validateMarks(
	marks: unknown,
	path: PMPath,
	schema: ContentSchema,
	issues: ValidationIssue[],
	options?: ValidateDocumentOptions
): void {
	if (marks === undefined || marks === null) return;

	if (!Array.isArray(marks)) {
		pushIssue(issues, options, {
			code: 'MALFORMED_NODE',
			path: [...path, 'marks'],
			message: 'Node marks must be an array when present',
			severity: 'error'
		});
		return;
	}

	marks.forEach((mark: PMMark, markIndex: number) => {
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

function validateBlockContent(
	node: PMNode,
	block: BlockDefinition,
	path: PMPath,
	issues: ValidationIssue[],
	options?: ValidateDocumentOptions
): boolean {
	if (node.content === undefined) {
		return true;
	}

	if (!Array.isArray(node.content)) {
		pushIssue(issues, options, {
			code: 'INVALID_CONTENT',
			path: [...path, 'content'],
			message: `Block "${block.id}" content must be an array when present`,
			severity: 'error'
		});
		return false;
	}

	if (!block.content) {
		pushIssue(issues, options, {
			code: 'INVALID_CONTENT',
			path: [...path, 'content'],
			message: `Atomic block "${block.id}" cannot contain child content`,
			severity: 'error'
		});
		return false;
	}

	return true;
}

function validateNode(
	node: PMNode,
	path: PMPath,
	registryBlocks: ReadonlyMap<string, BlockDefinition>,
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
		if (!validateBlockContent(node, block, path, issues, options)) {
			return;
		}
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

	if (!block && node.content && !Array.isArray(node.content)) {
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

	if (typeof document.version === 'number' && document.version > CURRENT_DOCUMENT_VERSION) {
		pushIssue(issues, options, {
			code: 'UNSUPPORTED_VERSION',
			path: ['version'],
			message: `Document version ${document.version} is newer than the supported version ${CURRENT_DOCUMENT_VERSION}`,
			severity: 'warning',
			details: { version: document.version, supportedVersion: CURRENT_DOCUMENT_VERSION }
		});
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

	validateMeta(document.meta, schema.metaFields, issues, options);

	const registryBlocks = registry.byId;
	document.content?.forEach((node: PMNode, index: number) => {
		validateNode(node, ['content', index], registryBlocks, schema, issues, options);
	});

	return {
		ok: !issues.some((issue) => issue.severity === 'error'),
		issues
	};
}
