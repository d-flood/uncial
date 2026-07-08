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
