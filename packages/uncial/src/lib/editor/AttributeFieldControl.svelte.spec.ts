import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AttributeFieldControl from './AttributeFieldControl.svelte';
import type { AttributeSpec } from '../core/types.js';

const spec: AttributeSpec<string> = {
	default: 'width-1200',
	input: 'select',
	options: [
		{ value: 'width-800', label: 'width-800' },
		{ value: 'width-1200', label: 'width-1200' }
	]
};

describe('AttributeFieldControl select', () => {
	it('renders declared options and selects the current value', async () => {
		const rendered = render(AttributeFieldControl, {
			name: 'rendition',
			spec,
			value: 'width-800',
			onChange: () => {}
		});

		const select = rendered.container.querySelector('select');
		expect(select).not.toBeNull();
		expect(select?.value).toBe('width-800');
		expect(Array.from(select?.options ?? []).map((option) => option.value)).toEqual([
			'width-800',
			'width-1200'
		]);
	});

	it('keeps a stored value outside the options list visible and selected', async () => {
		const rendered = render(AttributeFieldControl, {
			name: 'rendition',
			spec,
			value: 'width-650',
			onChange: () => {}
		});

		const select = rendered.container.querySelector('select');
		expect(select).not.toBeNull();
		expect(select?.value).toBe('width-650');
		const options = Array.from(select?.options ?? []);
		expect(options.map((option) => option.value)).toEqual(['width-650', 'width-800', 'width-1200']);
		expect(options[0]?.textContent).toContain('(current)');
	});

	it('associates a real <label for> with the control', async () => {
		const rendered = render(AttributeFieldControl, {
			name: 'rendition',
			spec,
			value: 'width-800',
			onChange: () => {}
		});

		const label = rendered.container.querySelector<HTMLLabelElement>('label.uncial-field__label');
		const select = rendered.container.querySelector('select');
		expect(label).not.toBeNull();
		expect(select?.id).toBeTruthy();
		expect(label?.htmlFor).toBe(select?.id);
		// The label supersedes the previous aria-label so the control is not
		// announced twice.
		expect(select?.getAttribute('aria-label')).toBeNull();
	});

	it('gives each field instance a unique control id', async () => {
		const first = render(AttributeFieldControl, {
			name: 'rendition',
			spec,
			value: 'width-800',
			onChange: () => {}
		});
		const second = render(AttributeFieldControl, {
			name: 'rendition',
			spec,
			value: 'width-800',
			onChange: () => {}
		});

		const firstId = first.container.querySelector('select')?.id;
		const secondId = second.container.querySelector('select')?.id;
		expect(firstId).toBeTruthy();
		expect(secondId).toBeTruthy();
		expect(firstId).not.toBe(secondId);
	});
});

describe('AttributeFieldControl list', () => {
	const factsSpec: AttributeSpec<Array<{ label: string; value: string }>> = {
		default: [],
		list: { itemLabel: 'fact', fields: { label: '', value: '' } }
	};

	it('renders a field per item field instead of a JSON textarea', async () => {
		const rendered = render(AttributeFieldControl, {
			name: 'facts',
			spec: factsSpec,
			value: [
				{ label: 'Hours', value: '3-6pm' },
				{ label: 'Location', value: 'Edgerton' }
			],
			onChange: () => {}
		});

		expect(rendered.container.querySelector('textarea')).toBeNull();
		const inputs = Array.from(rendered.container.querySelectorAll('input'));
		expect(inputs.map((input) => input.value)).toEqual([
			'Hours',
			'3-6pm',
			'Location',
			'Edgerton'
		]);
	});

	it('reports edits, additions, reordering and removal as whole arrays', async () => {
		const changes: unknown[] = [];
		const value = [
			{ label: 'Hours', value: '3-6pm' },
			{ label: 'Location', value: 'Edgerton' }
		];
		const rendered = render(AttributeFieldControl, {
			name: 'facts',
			spec: factsSpec,
			value,
			onChange: (next) => changes.push(next)
		});

		const input = rendered.container.querySelectorAll('input')[0] as HTMLInputElement;
		input.value = 'Open';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(changes.at(-1)).toEqual([
			{ label: 'Open', value: '3-6pm' },
			{ label: 'Location', value: 'Edgerton' }
		]);

		const button = (label: string) =>
			rendered.container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
		button('Move fact down')?.click();
		expect(changes.at(-1)).toEqual([
			{ label: 'Location', value: 'Edgerton' },
			{ label: 'Hours', value: '3-6pm' }
		]);

		button('Remove fact')?.click();
		expect(changes.at(-1)).toEqual([{ label: 'Location', value: 'Edgerton' }]);

		rendered.container.querySelector<HTMLButtonElement>('.uncial-list-field > button')?.click();
		expect(changes.at(-1)).toEqual([...value, { label: '', value: '' }]);
	});

	it('edits a list of single values with one control per item', async () => {
		const changes: unknown[] = [];
		const rendered = render(AttributeFieldControl, {
			name: 'slugs',
			spec: {
				default: [] as string[],
				list: { itemLabel: 'essay', value: { default: '', options: ['one', 'two'] } }
			},
			value: ['two'],
			onChange: (next) => changes.push(next)
		});

		const selects = Array.from(rendered.container.querySelectorAll('select'));
		expect(selects).toHaveLength(1);
		expect(selects[0].value).toBe('two');

		selects[0].value = 'one';
		selects[0].dispatchEvent(new Event('change', { bubbles: true }));
		expect(changes.at(-1)).toEqual(['one']);
	});
});

describe('AttributeFieldControl image', () => {
	const imageSpec: AttributeSpec<string> = { default: '', input: 'image' };

	function buttonLabels(container: HTMLElement): string[] {
		return Array.from(container.querySelectorAll('button')).map(
			(button) => button.textContent?.trim() ?? ''
		);
	}

	it('offers no image Upload when the source cannot upload', () => {
		const rendered = render(AttributeFieldControl, {
			name: 'src',
			spec: imageSpec,
			value: '/media/a.png',
			imageSource: { thumbnail: (src: string) => `/base${src}` },
			onChange: () => {}
		});

		expect(buttonLabels(rendered.container)).toEqual(['Clear']);
		expect(rendered.container.querySelector('input[type="file"]')).toBeNull();
		expect(rendered.container.querySelector('img')?.getAttribute('src')).toBe('/base/media/a.png');
	});

	it('renders the image thumbnail and Clear with no source at all', () => {
		const rendered = render(AttributeFieldControl, {
			name: 'src',
			spec: imageSpec,
			value: '/media/a.png',
			onChange: () => {}
		});

		expect(buttonLabels(rendered.container)).toEqual(['Clear']);
		expect(rendered.container.querySelector('img')?.getAttribute('src')).toBe('/media/a.png');
	});

	it('clears the image to an empty string', () => {
		const changes: unknown[] = [];
		const rendered = render(AttributeFieldControl, {
			name: 'src',
			spec: imageSpec,
			value: '/media/a.png',
			imageSource: { upload: async () => '/media/b.png' },
			onChange: (next: unknown) => changes.push(next)
		});

		expect(buttonLabels(rendered.container)).toEqual(['Upload', 'Clear']);
		const clear = Array.from(rendered.container.querySelectorAll('button')).find(
			(button) => button.textContent?.trim() === 'Clear'
		);
		clear?.click();
		expect(changes).toEqual(['']);
	});
});
