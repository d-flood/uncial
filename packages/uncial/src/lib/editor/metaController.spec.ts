import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { createDocumentMetaController } from './metaController.js';
import type { AttributeSpec } from '../core/types.js';

describe('DocumentMetaController', () => {
	const fields = new Map<string, AttributeSpec<unknown>>([
		['title', { default: '', required: true, validate: (value) => typeof value === 'string' && value.length > 0 }],
		['featured', { default: false }],
		['priority', { default: 0 }]
	]);

	it('tracks draft edits and commits normalized metadata', () => {
		const controller = createDocumentMetaController(fields, { title: 'Draft' });

		controller.setDraft('featured', true);
		controller.setDraft('priority', '3');
		const result = controller.commit();

		expect(result.validation.ok).toBe(true);
		expect(result.meta).toEqual({ title: 'Draft', featured: true, priority: 3 });
		expect(controller.getMeta()).toEqual(result.meta);
		expect(get(controller).dirty).toBe(false);
	});

	it('surfaces validation errors and can reset the draft', () => {
		const controller = createDocumentMetaController(fields, { title: 'Draft' });

		controller.setDraft('title', '');
		const result = controller.commit();

		expect(result.validation.ok).toBe(false);
		expect(get(controller).errors.title).toContain('Required metadata field');
		expect(controller.getMeta()).toEqual({ title: 'Draft', featured: false, priority: 0 });

		controller.reset({ title: 'Reset', featured: true, priority: 2 });
		expect(get(controller)).toEqual({
			draft: { title: 'Reset', featured: true, priority: 2 },
			errors: {},
			dirty: false
		});
	});

	it('updates draft shape when metadata fields change', () => {
		const controller = createDocumentMetaController(fields, { title: 'Draft' });
		controller.setMetaFields(new Map([['author', { default: 'Unknown' }]]));

		expect(get(controller).draft).toEqual({ author: 'Unknown' });
	});
});
