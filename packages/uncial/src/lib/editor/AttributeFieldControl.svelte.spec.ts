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
});
