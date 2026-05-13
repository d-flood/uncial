import { describe, expect, it } from 'vitest';
import './index.js';

describe('web components', () => {
	it('registers the editor and renderer elements', () => {
		expect(customElements.get('uncial-editor')).toBeTruthy();
		expect(customElements.get('uncial-renderer')).toBeTruthy();
	});

	it('renders content assigned as a DOM property', async () => {
		const element = document.createElement('uncial-renderer');
		Object.assign(element, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'text', text: 'Rendered from a custom element' }]
					}
				]
			}
		});

		document.body.append(element);

		await expect.poll(() => element.shadowRoot?.textContent ?? '').toContain('Rendered from a custom element');

		element.remove();
	});

	it('dispatches renderer validation issues as custom events', async () => {
		const element = document.createElement('uncial-renderer');
		const issues: CustomEvent[] = [];
		element.addEventListener('uncial-issue', (event) => {
			issues.push(event as CustomEvent);
		});
		Object.assign(element, {
				schema: {
					allowedBlocks: new Set(),
					allowedMarks: new Set(),
					metaFields: new Map()
				},
			content: {
				type: 'doc',
				content: [{ type: 'unknownBlock' }]
			}
		});

		document.body.append(element);

		await expect.poll(() => issues.length).toBeGreaterThan(0);
		expect(issues[0]?.bubbles).toBe(true);
		expect(issues[0]?.composed).toBe(true);
		expect(issues[0]?.detail).toMatchObject({ code: 'UNKNOWN_BLOCK' });

		element.remove();
	});
});
