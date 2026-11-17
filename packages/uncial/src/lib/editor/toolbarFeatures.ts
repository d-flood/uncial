import type { Editor } from '@tiptap/core';
import type { BlockIcon, ContentSchema } from '../core/types.js';
import type { MarkDeclaration, ToolbarItem } from '../model.js';

export type ToolbarFeatureId =
	| 'bold'
	| 'italic'
	| 'strike'
	| 'code'
	| 'link'
	| 'superscript'
	| 'subscript'
	| 'heading2'
	| 'heading3'
	| 'heading4'
	| 'heading5'
	| 'heading6'
	| 'bulletList'
	| 'orderedList'
	| 'blockquote'
	| 'codeBlock'
	| 'horizontalRule'
	| 'table'
	| 'addRowAfter'
	| 'deleteRow'
	| 'addColumnAfter'
	| 'deleteColumn';

export interface ToolbarFeatureContext {
	editor: Editor;
	schema?: ContentSchema;
}

export interface ToolbarFeature {
	id: string;
	label: string;
	tooltip?: string;
	/** A string renders as text; a component renders with `size` and `weight` props. */
	icon?: BlockIcon;
	group?: 'mark' | 'heading' | 'block' | 'insert' | string;
	isAllowed?: (context: ToolbarFeatureContext) => boolean;
	isActive?: (context: ToolbarFeatureContext) => boolean;
	canRun?: (context: ToolbarFeatureContext) => boolean;
	run: (context: ToolbarFeatureContext) => void;
}

function markAllowed(mark: string) {
	return ({ schema }: ToolbarFeatureContext) => !schema || schema.allowedMarks.has(mark);
}

function activeMark(mark: string) {
	return ({ editor }: ToolbarFeatureContext) => editor.isActive(mark);
}

function toggleMark(command: 'toggleBold' | 'toggleItalic' | 'toggleStrike' | 'toggleCode') {
	return ({ editor }: ToolbarFeatureContext) => editor.chain().focus()[command]().run();
}

function canToggleMark(command: 'toggleBold' | 'toggleItalic' | 'toggleStrike' | 'toggleCode') {
	return ({ editor }: ToolbarFeatureContext) => editor.can().chain().focus()[command]().run();
}

// Opt-in marks: only a schema that names them has them.
function scriptFeature(mark: 'superscript' | 'subscript', label: string): ToolbarFeature {
	const toggle = mark === 'superscript' ? 'toggleSuperscript' : 'toggleSubscript';
	return {
		id: mark,
		label,
		group: 'mark',
		isAllowed: ({ schema }) => schema?.allowedMarks.has(mark) ?? false,
		isActive: activeMark(mark),
		canRun: ({ editor }) => editor.can().chain().focus()[toggle]().run(),
		run: ({ editor }) => editor.chain().focus()[toggle]().run()
	};
}

function headingFeature(level: 2 | 3 | 4 | 5 | 6): ToolbarFeature {
	return {
		id: `heading${level}`,
		label: `H${level}`,
		tooltip: `Heading ${level}`,
		group: 'heading',
		isActive: ({ editor }) => editor.isActive('heading', { level }),
		canRun: ({ editor }) => editor.can().chain().focus().toggleHeading({ level }).run(),
		run: ({ editor }) => editor.chain().focus().toggleHeading({ level }).run()
	};
}

export const builtinToolbarFeatures: readonly ToolbarFeature[] = [
	{
		id: 'bold',
		label: 'Bold',
		group: 'mark',
		isAllowed: markAllowed('bold'),
		isActive: activeMark('bold'),
		canRun: canToggleMark('toggleBold'),
		run: toggleMark('toggleBold')
	},
	{
		id: 'italic',
		label: 'Italic',
		group: 'mark',
		isAllowed: markAllowed('italic'),
		isActive: activeMark('italic'),
		canRun: canToggleMark('toggleItalic'),
		run: toggleMark('toggleItalic')
	},
	{
		id: 'strike',
		label: 'Strike',
		group: 'mark',
		isAllowed: markAllowed('strike'),
		isActive: activeMark('strike'),
		canRun: canToggleMark('toggleStrike'),
		run: toggleMark('toggleStrike')
	},
	{
		id: 'code',
		label: 'Code',
		group: 'mark',
		isAllowed: markAllowed('code'),
		isActive: activeMark('code'),
		canRun: canToggleMark('toggleCode'),
		run: toggleMark('toggleCode')
	},
	{
		id: 'link',
		label: 'Link',
		group: 'mark',
		isAllowed: markAllowed('link'),
		isActive: activeMark('link'),
		canRun: ({ editor }) => editor.can().chain().focus().toggleLink({ href: '#' }).run(),
		run: ({ editor }) => editor.chain().focus().toggleLink({ href: '#' }).run()
	},
	scriptFeature('superscript', 'Superscript'),
	scriptFeature('subscript', 'Subscript'),
	headingFeature(2),
	headingFeature(3),
	headingFeature(4),
	headingFeature(5),
	headingFeature(6),
	{
		id: 'bulletList',
		label: 'Bullet list',
		group: 'block',
		isActive: ({ editor }) => editor.isActive('bulletList'),
		canRun: ({ editor }) => editor.can().chain().focus().toggleBulletList().run(),
		run: ({ editor }) => editor.chain().focus().toggleBulletList().run()
	},
	{
		id: 'orderedList',
		label: 'Ordered list',
		group: 'block',
		isActive: ({ editor }) => editor.isActive('orderedList'),
		canRun: ({ editor }) => editor.can().chain().focus().toggleOrderedList().run(),
		run: ({ editor }) => editor.chain().focus().toggleOrderedList().run()
	},
	{
		id: 'blockquote',
		label: 'Blockquote',
		group: 'block',
		isActive: ({ editor }) => editor.isActive('blockquote'),
		canRun: ({ editor }) => editor.can().chain().focus().toggleBlockquote().run(),
		run: ({ editor }) => editor.chain().focus().toggleBlockquote().run()
	},
	{
		id: 'codeBlock',
		label: 'Code block',
		group: 'block',
		isActive: ({ editor }) => editor.isActive('codeBlock'),
		canRun: ({ editor }) => editor.can().chain().focus().toggleCodeBlock().run(),
		run: ({ editor }) => editor.chain().focus().toggleCodeBlock().run()
	},
	{
		id: 'horizontalRule',
		label: 'Horizontal rule',
		group: 'block',
		canRun: ({ editor }) => editor.can().chain().focus().setHorizontalRule().run(),
		run: ({ editor }) => editor.chain().focus().setHorizontalRule().run()
	},
	{
		id: 'table',
		label: 'Table',
		tooltip: 'Insert table',
		group: 'table',
		canRun: ({ editor }) => editor.can().insertTable({ rows: 3, cols: 2, withHeaderRow: true }),
		run: ({ editor }) =>
			editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()
	},
	tableFeature('addRowAfter', 'Add row'),
	tableFeature('deleteRow', 'Delete row'),
	tableFeature('addColumnAfter', 'Add column'),
	tableFeature('deleteColumn', 'Delete column')
];

function tableFeature(
	id: 'addRowAfter' | 'deleteRow' | 'addColumnAfter' | 'deleteColumn',
	label: string
): ToolbarFeature {
	return {
		id,
		label,
		group: 'table',
		canRun: ({ editor }) => editor.can()[id](),
		run: ({ editor }) => editor.chain().focus()[id]().run()
	};
}

function markFeature({ id, toolbar }: MarkDeclaration): ToolbarFeature {
	return {
		id,
		label: toolbar?.label ?? id,
		icon: toolbar?.icon,
		group: 'mark',
		isAllowed: markAllowed(id),
		isActive: activeMark(id),
		canRun: ({ editor }) => editor.can().chain().focus().toggleMark(id).run(),
		run: ({ editor }) => editor.chain().focus().toggleMark(id).run()
	};
}

/**
 * A single generic heading toggle (level 3) whose active state matches any
 * heading level. Used by editors that expose one heading control instead of
 * the per-level `heading2`..`heading6` buttons.
 */
export const genericHeadingToolbarFeature: ToolbarFeature = {
	id: 'heading',
	label: 'Heading',
	group: 'heading',
	isActive: ({ editor }) => editor.isActive('heading'),
	canRun: ({ editor }) => editor.can().chain().focus().toggleHeading({ level: 3 }).run(),
	run: ({ editor }) => editor.chain().focus().toggleHeading({ level: 3 }).run()
};

function builtinFeature(id: ToolbarFeatureId): ToolbarFeature {
	const feature = builtinToolbarFeatures.find((entry) => entry.id === id);
	if (!feature) throw new Error(`Unknown builtin toolbar feature: ${id}`);
	return feature;
}

/**
 * Toolbar descriptors for the rich text attribute editor. Ids line up with
 * `RichTextFeature` names so the list can be filtered by a resolved rich text
 * feature set; labels match that editor's existing button labels.
 */
export const richTextAttributeToolbarFeatures: readonly ToolbarFeature[] = [
	builtinFeature('bold'),
	builtinFeature('italic'),
	{ ...builtinFeature('strike'), label: 'Strikethrough' },
	{ ...builtinFeature('code'), label: 'Inline code' },
	genericHeadingToolbarFeature,
	builtinFeature('bulletList'),
	builtinFeature('orderedList'),
	builtinFeature('blockquote'),
	builtinFeature('codeBlock'),
	builtinFeature('horizontalRule')
];

/** The model's one toolbar list: built-in ids, defined Mark ids and features, in display order. */
export function resolveToolbar({
	editor,
	schema,
	toolbar,
	marks = []
}: {
	editor: Editor | null | undefined;
	schema?: ContentSchema;
	toolbar: readonly ToolbarItem[];
	marks?: readonly MarkDeclaration[];
}): ToolbarFeature[] {
	if (!editor) return [];
	const context = { editor, schema };
	return toolbar.flatMap((item) => {
		let feature: ToolbarFeature | undefined;
		if (typeof item !== 'string') {
			feature = item;
		} else {
			const mark = marks.find((entry) => entry.id === item);
			feature = mark
				? markFeature(mark)
				: builtinToolbarFeatures.find((entry) => entry.id === item);
			if (!feature) console.warn(`Unknown toolbar id "${item}"`);
		}
		return feature && (feature.isAllowed?.(context) ?? true) ? [feature] : [];
	});
}
