import { userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import './index.js';
import type { UncialEditorElement, UncialRendererElement } from './index.js';

function createEditorElement(): UncialEditorElement & HTMLElement {
	return document.createElement('uncial-editor') as UncialEditorElement & HTMLElement;
}

function createRendererElement(): UncialRendererElement & HTMLElement {
	return document.createElement('uncial-renderer') as UncialRendererElement & HTMLElement;
}

async function mountEditor(element: UncialEditorElement & HTMLElement): Promise<HTMLElement> {
	document.body.append(element);
	await expect.poll(() => element.shadowRoot?.querySelector('.ProseMirror')).toBeTruthy();
	return element.shadowRoot?.querySelector<HTMLElement>('.ProseMirror') as HTMLElement;
}

describe('web components', () => {
	it('registers the editor and renderer elements', () => {
		expect(customElements.get('uncial-editor')).toBeTruthy();
		expect(customElements.get('uncial-renderer')).toBeTruthy();
	});

	it('renders content assigned as a DOM property', async () => {
		const element = createRendererElement();
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

		await expect
			.poll(() => element.shadowRoot?.textContent ?? '')
			.toContain('Rendered from a custom element');

		element.remove();
	});

	it('dispatches renderer validation issues as custom events', async () => {
		const element = createRendererElement();
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

	it('updates the renderer in place when properties change after mount', async () => {
		const element = createRendererElement();
		Object.assign(element, {
			content: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First document' }] }]
			}
		});

		document.body.append(element);

		await expect.poll(() => element.shadowRoot?.textContent ?? '').toContain('First document');
		const rendererDom = element.shadowRoot?.querySelector('.uncial-renderer');
		expect(rendererDom).toBeTruthy();

		element.content = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second document' }] }]
		};

		await expect.poll(() => element.shadowRoot?.textContent ?? '').toContain('Second document');
		expect(element.shadowRoot?.querySelector('.uncial-renderer')).toBe(rendererDom);

		element.remove();
	});

	it('sets the editor document without remounting the editor', async () => {
		const element = createEditorElement();
		const editorDom = await mountEditor(element);

		editorDom.focus();
		expect(element.shadowRoot?.activeElement).toBe(editorDom);

		element.json = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'External update' }] }]
		};

		await expect.poll(() => editorDom.textContent ?? '').toContain('External update');

		// The same ProseMirror root must survive the property set...
		expect(element.shadowRoot?.querySelector('.ProseMirror')).toBe(editorDom);
		// ...and typing state (focus) must be preserved.
		expect(element.shadowRoot?.activeElement).toBe(editorDom);

		element.remove();
	});

	it('emits uncial-change for user edits and reflects them in the json property', async () => {
		const element = createEditorElement();
		const changes: CustomEvent[] = [];
		element.addEventListener('uncial-change', (event) => {
			changes.push(event as CustomEvent);
		});

		const editorDom = await mountEditor(element);
		editorDom.focus();

		await userEvent.keyboard('Hello editor');

		await expect.poll(() => JSON.stringify(element.json ?? {})).toContain('Hello editor');
		expect(changes.length).toBeGreaterThan(0);
		expect(JSON.stringify(changes.at(-1)?.detail)).toContain('Hello editor');

		// Internal edits must not re-enter the editor as an external setContent:
		// the ProseMirror root keeps focus, the characters land in typing order,
		// and the DOM node survives the change events without a remount.
		expect(editorDom.textContent).toContain('Hello editor');
		expect(element.shadowRoot?.querySelector('.ProseMirror')).toBe(editorDom);
		expect(element.shadowRoot?.activeElement).toBe(editorDom);

		element.remove();
	});

	it('threads metaFields, emits uncial-meta-change, and reflects committed meta', async () => {
		const element = createEditorElement();
		const metaChanges: CustomEvent[] = [];
		element.addEventListener('uncial-meta-change', (event) => {
			metaChanges.push(event as CustomEvent);
		});
		element.metaFields = { title: { default: '' } };

		await mountEditor(element);

		// metaFields flows through to the editor, rendering the metadata dropdown.
		expect(
			element.shadowRoot?.querySelector('summary[aria-label="Edit document metadata"]')
		).toBeTruthy();

		const titleInput = element.shadowRoot?.querySelector<HTMLInputElement>(
			'.uncial-meta-panel input'
		);
		expect(titleInput).toBeTruthy();
		titleInput!.value = 'Doc title';
		titleInput!.dispatchEvent(new Event('input', { bubbles: true }));

		const saveButton = Array.from(element.shadowRoot?.querySelectorAll('button') ?? []).find(
			(button) => button.textContent?.includes('Save Metadata')
		);
		expect(saveButton).toBeTruthy();
		saveButton!.click();

		await expect.poll(() => metaChanges.length).toBeGreaterThan(0);
		expect(metaChanges.at(-1)?.detail).toMatchObject({ title: 'Doc title' });
		expect(metaChanges.at(-1)?.bubbles).toBe(true);
		expect(metaChanges.at(-1)?.composed).toBe(true);
		expect(element.meta).toMatchObject({ title: 'Doc title' });

		element.remove();
	});

	it('keeps a dropdown open when interacting inside it within the shadow root', async () => {
		const element = createEditorElement();
		element.metaFields = { title: { default: '' } };
		await mountEditor(element);

		const summary = element.shadowRoot?.querySelector<HTMLElement>(
			'summary[aria-label="Edit document metadata"]'
		);
		const details = summary?.closest('details');
		expect(details).toBeTruthy();
		details!.open = true;

		const titleInput = element.shadowRoot?.querySelector<HTMLInputElement>(
			'.uncial-meta-panel input'
		);
		expect(titleInput).toBeTruthy();

		// A focus/pointer interaction *inside* the menu retargets to the custom
		// element at the document listener; the dropdownDismiss action must use
		// composedPath() to recognise it as inside and leave the menu open.
		titleInput!.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
		titleInput!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));

		expect(details!.open).toBe(true);
		element.remove();
	});

	it('renders stylesheet links into the shadow root and applies them', async () => {
		const css = '.uncial-renderer { color: rgb(200, 10, 10); }';
		const href = URL.createObjectURL(new Blob([css], { type: 'text/css' }));

		const element = createRendererElement();
		element.stylesheet = href;
		Object.assign(element, {
			content: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Styled content' }] }]
			}
		});

		document.body.append(element);

		const link = element.shadowRoot?.querySelector('link[rel="stylesheet"]');
		expect(link?.getAttribute('href')).toBe(href);
		expect(element.getAttribute('stylesheet')).toBe(href);

		await expect
			.poll(() => {
				const target = element.shadowRoot?.querySelector('.uncial-renderer');
				return target ? getComputedStyle(target).color : '';
			})
			.toBe('rgb(200, 10, 10)');

		element.remove();
		URL.revokeObjectURL(href);
	});
});
