import type { JSONContent } from '@tiptap/core';

export function emptyDocument(): JSONContent {
	return {
		type: 'doc',
		version: 1,
		content: [{ type: 'paragraph' }]
	};
}
