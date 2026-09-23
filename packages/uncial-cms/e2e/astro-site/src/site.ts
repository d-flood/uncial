// Imports nothing from the uncial-cms root, whose editor stylesheet would
// otherwise be linked into the reader pages.
import { createBlockRegistry, createSchema } from 'uncial/core';

export const blocks = createBlockRegistry([]);

export const schema = createSchema(blocks, {
	metaFields: { title: { default: 'Untitled page', required: true } }
});

// `settings.json` stands in for the non-page files every real content dir holds.
export const exclude = (entry: { path: string }) => entry.path === 'settings';
