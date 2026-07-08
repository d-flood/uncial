import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import type { BlockRegistry, ContentSchema } from '../core/types.js';
import { getBlockDefaultAttrs } from '../shared/tiptap.js';
import type { ActiveBlockSelection } from './attributesController.js';

export interface ContainerChildOps {
	move(fromIndex: number, toIndex: number): boolean;
	insert(blockId: string, attrs?: Record<string, unknown>): boolean;
	remove(index: number): boolean;
}

/**
 * Live view of the controller's mutable context. The ops read the editor,
 * registry and schema lazily (they change on attach/detach) and resolve the
 * currently-open block on demand, so a single ops instance created once at
 * controller construction stays correct across re-attaches.
 */
export interface ContainerChildOpsContext {
	getEditor(): Editor | null;
	getRegistry(): BlockRegistry | null;
	getSchema(): ContentSchema | undefined;
	/** The block the panel is currently editing, re-resolved against the live doc. */
	resolveActiveBlock(): ActiveBlockSelection | null;
	/** Dispatch a transaction with `bindEditor`'s auto-open suppressed for its echo. */
	dispatch(tr: Transaction): void;
	/** Re-derive controller state after the doc changed (an 'update' sync). */
	sync(): void;
}

/**
 * Add / move / remove children of the container block the panel is editing.
 * Each op mutates only the document (never the controller store directly) and
 * then asks the controller to re-sync, so container-child edits produce exactly
 * one state notification — the same as before this was extracted.
 */
export function createContainerChildOps(ctx: ContainerChildOpsContext): ContainerChildOps {
	function move(fromIndex: number, toIndex: number): boolean {
		const editor = ctx.getEditor();
		const registry = ctx.getRegistry();
		if (!editor || !registry || fromIndex === toIndex) return false;
		const active = ctx.resolveActiveBlock();
		if (!active) return false;
		const block = registry.get(active.id);
		if (!block || !block.content) return false;

		const node = editor.state.doc.nodeAt(active.pos);
		if (!node) return false;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const children: any[] = [];
		node.forEach((child) => children.push(child));

		if (
			fromIndex < 0 ||
			fromIndex >= children.length ||
			toIndex < 0 ||
			toIndex >= children.length
		) {
			return false;
		}

		const [moved] = children.splice(fromIndex, 1);
		children.splice(toIndex, 0, moved);

		const { tr } = editor.state;
		const contentStart = active.pos + 1;
		const contentEnd = active.pos + node.nodeSize - 1;

		tr.replaceWith(contentStart, contentEnd, children);
		ctx.dispatch(tr);
		ctx.sync();
		return true;
	}

	function insert(blockId: string, attrs?: Record<string, unknown>): boolean {
		const editor = ctx.getEditor();
		const registry = ctx.getRegistry();
		const schema = ctx.getSchema();
		if (!editor || !registry?.has(blockId)) return false;
		if (schema && !schema.allowedBlocks.has(blockId)) return false;

		const active = ctx.resolveActiveBlock();
		if (!active) return false;

		const containerBlock = registry.get(active.id);
		if (!containerBlock?.content) return false;

		const containerNode = editor.state.doc.nodeAt(active.pos);
		if (!containerNode) return false;

		const childBlock = registry.get(blockId);
		const childNodeType = editor.schema.nodes[blockId];
		if (!childBlock || !childNodeType) return false;

		const childNode = childNodeType.createAndFill(attrs ?? getBlockDefaultAttrs(childBlock));
		if (!childNode) return false;

		ctx.dispatch(editor.state.tr.insert(active.pos + containerNode.nodeSize - 1, childNode));
		ctx.sync();
		return true;
	}

	function remove(index: number): boolean {
		const editor = ctx.getEditor();
		const registry = ctx.getRegistry();
		if (!editor || !registry) return false;
		const active = ctx.resolveActiveBlock();
		if (!active) return false;
		const block = registry.get(active.id);
		if (!block?.content) return false;
		const node = editor.state.doc.nodeAt(active.pos);
		if (!node || node.childCount <= 1 || index < 0 || index >= node.childCount) return false;

		let childStart = active.pos + 1;
		for (let i = 0; i < index; i += 1) {
			childStart += node.child(i).nodeSize;
		}
		const child = node.child(index);
		ctx.dispatch(editor.state.tr.delete(childStart, childStart + child.nodeSize));
		ctx.sync();
		return true;
	}

	return { move, insert, remove };
}
