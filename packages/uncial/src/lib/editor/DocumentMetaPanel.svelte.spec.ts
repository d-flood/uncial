import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { AttributeSpec } from '../core/types.js';
import DocumentMetaPanel from './DocumentMetaPanel.svelte';
import { createDocumentMetaController } from './metaController.js';

it('shows a metadata field only when the metadata calls for it', async () => {
	const fields = new Map<string, AttributeSpec<unknown>>([
		['kind', { default: 'page', options: ['page', 'link'], label: 'Kind' }],
		['url', { default: '', label: 'Address', when: (meta) => meta.kind === 'link' }]
	]);
	const controller = createDocumentMetaController(fields, { kind: 'page' });
	const rendered = render(DocumentMetaPanel, { controller, fields });
	const labels = () =>
		Array.from(rendered.container.querySelectorAll('.uncial-field__label')).map(
			(label) => label.textContent
		);

	await expect.poll(labels).toEqual(['Kind']);
	controller.setDraft('kind', 'link');
	await expect.poll(labels).toEqual(['Kind', 'Address']);
});
