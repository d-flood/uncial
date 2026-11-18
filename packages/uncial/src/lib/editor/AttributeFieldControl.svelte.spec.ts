import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import AttributeFieldControl from './AttributeFieldControl.svelte';
import type { AttributeSpec, ImageChooser } from '../core/types.js';
import ImageChooserFixture from '../shared/ImageChooserFixture.svelte';

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
		expect(inputs.map((input) => input.value)).toEqual(['Hours', '3-6pm', 'Location', 'Edgerton']);
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

	describe('nested in a list item', () => {
		const footerSpec: AttributeSpec<unknown> = {
			default: [],
			list: {
				itemLabel: 'column',
				fields: {
					heading: '',
					links: { default: [], list: { itemLabel: 'link', fields: { label: '', href: '' } } }
				}
			}
		};
		const about = { heading: 'About', links: [{ label: 'Home', href: '/' }] };
		const hours = { label: 'Hours', href: '/hours' };
		const map = { label: 'Map', href: '/map' };
		const footer = [about, { heading: 'Visit', links: [hours, map] }];

		it('adds, reorders and removes items of the right inner list', async () => {
			const changes: unknown[] = [];
			const rendered = render(AttributeFieldControl, {
				name: 'footer',
				spec: footerSpec,
				value: footer,
				onChange: (next) => changes.push(next)
			});

			const visitLinks = rendered.container.querySelectorAll<HTMLElement>('.uncial-list-field')[2];
			const button = (label: string, index = 0) =>
				visitLinks.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)[index];

			button('Move link down').click();
			expect(changes.at(-1)).toEqual([about, { heading: 'Visit', links: [map, hours] }]);

			button('Remove link', 1).click();
			expect(changes.at(-1)).toEqual([about, { heading: 'Visit', links: [hours] }]);

			visitLinks.querySelector<HTMLButtonElement>(':scope > button')?.click();
			expect(changes.at(-1)).toEqual([
				about,
				{ heading: 'Visit', links: [hours, map, { label: '', href: '' }] }
			]);
		});

		it('shows an item field error beside that field', async () => {
			const message = 'Metadata field "footer.1.links.0.href" is invalid';
			const rendered = render(AttributeFieldControl, {
				name: 'footer',
				spec: footerSpec,
				value: footer,
				errors: { 'footer.1.links.0.href': message },
				onChange: () => {}
			});

			const href = rendered.container.querySelectorAll('input[placeholder="href"]')[1];
			expect(
				href.closest('.uncial-field')?.querySelector('.uncial-field__error')?.textContent
			).toBe(message);
			expect(rendered.container.querySelectorAll('.uncial-field__error')).toHaveLength(1);
		});
	});
});

describe('AttributeFieldControl image', () => {
	const imageSpec: AttributeSpec<string> = { default: '', input: 'image' };

	function buttonLabels(container: HTMLElement): string[] {
		// The picker dialog's own buttons are not field actions.
		return Array.from(container.querySelectorAll('button:not(dialog button)')).map(
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

	it('offers Choose existing and no Upload for a browse-only image source', () => {
		const rendered = render(AttributeFieldControl, {
			name: 'src',
			spec: imageSpec,
			value: '/media/a.png',
			imageSource: { browse: async () => ['/media/a.png'] },
			onChange: () => {}
		});

		expect(buttonLabels(rendered.container)).toEqual(['Choose existing', 'Clear']);
		expect(rendered.container.querySelector('input[type="file"]')).toBeNull();
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

	it('stores a picked file as its URL when the default is a string', async () => {
		const changes: unknown[] = [];
		const file = { src: '/a.pdf', name: 'a.pdf', size: 1, type: 'application/pdf' };
		const rendered = render(AttributeFieldControl, {
			name: 'download',
			spec: { default: '', input: 'file' },
			value: '',
			fileSource: { upload: async () => file },
			onChange: (next: unknown) => changes.push(next)
		});

		await userEvent.upload(
			rendered.container.querySelector('input[type="file"]')!,
			new File(['x'], 'a.pdf')
		);
		await expect.poll(() => changes).toEqual(['/a.pdf']);
	});
});

describe('AttributeFieldControl image choosers', () => {
	const archive: ImageChooser = {
		label: 'Choose from the archive',
		component: async () => ({ default: ImageChooserFixture }),
		thumbnail: async (value) => (value.item ? `/thumbs/${value.item}-${value.page}.jpg` : undefined)
	};
	const chooserSpec: AttributeSpec<unknown> = {
		default: null,
		input: 'image',
		image: { choosers: ['archive'] }
	};

	function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
		return Array.from(container.querySelectorAll('button')).find(
			(candidate) => candidate.textContent?.trim() === label
		);
	}

	it('offers a chooser beside the Media source and stores what it chooses', async () => {
		const changes: unknown[] = [];
		const rendered = render(AttributeFieldControl, {
			name: 'banner',
			spec: chooserSpec,
			value: { item: 'a', page: 1 },
			imageSource: { upload: async () => '/media/b.png' },
			imageChoosers: { archive },
			onChange: (next: unknown) => changes.push(next)
		});

		button(rendered.container, 'Choose from the archive')?.click();
		await expect
			.element(rendered.getByTestId('chooser-value'))
			.toHaveTextContent('{"item":"a","page":1}');
		await rendered.getByRole('button', { name: 'Page 2 of b' }).click();

		expect(changes).toEqual([{ item: 'b', page: 2 }]);
		expect(rendered.container.querySelector('dialog')?.open).toBe(false);
		expect(button(rendered.container, 'Upload')).toBeDefined();
	});

	it("shows a chosen value's thumbnail for picking its focal point", async () => {
		const rendered = render(AttributeFieldControl, {
			name: 'banner',
			spec: chooserSpec,
			value: { item: 'a', page: 1 },
			imageChoosers: { archive },
			onChange: () => {}
		});

		await expect
			.poll(() => rendered.container.querySelector('img')?.getAttribute('src'))
			.toBe('/thumbs/a-1.jpg');
		await expect
			.element(rendered.getByRole('button', { name: /focal point/i }))
			.toBeInTheDocument();
	});

	it('clears a chosen value to null', () => {
		const changes: unknown[] = [];
		const rendered = render(AttributeFieldControl, {
			name: 'banner',
			spec: chooserSpec,
			value: { item: 'a', page: 1 },
			imageChoosers: { archive },
			onChange: (next: unknown) => changes.push(next)
		});

		button(rendered.container, 'Clear')?.click();
		expect(changes).toEqual([null]);
	});

	it('offers only its choosers when media is false', () => {
		const rendered = render(AttributeFieldControl, {
			name: 'thumbnail',
			spec: { ...chooserSpec, image: { choosers: ['archive'], media: false } },
			value: null,
			imageSource: { upload: async () => '/media/b.png', browse: async () => [] },
			imageChoosers: { archive },
			onChange: () => {}
		});

		expect(button(rendered.container, 'Upload')).toBeUndefined();
		expect(button(rendered.container, 'Choose existing')).toBeUndefined();
		expect(button(rendered.container, 'Choose from the archive')).toBeDefined();
	});
});

describe('AttributeFieldControl image alt text', () => {
	const altSpec: AttributeSpec<unknown> = {
		default: null,
		input: 'image',
		image: { choosers: ['archive'] }
	};
	const archive: ImageChooser = {
		label: 'Choose from the archive',
		component: async () => ({ default: ImageChooserFixture })
	};

	it('edits alt text stored in the image value', async () => {
		const changes: unknown[] = [];
		const rendered = render(AttributeFieldControl, {
			name: 'cover',
			spec: altSpec,
			value: { src: '/media/a.png', alt: 'Old' },
			onChange: (next: unknown) => changes.push(next)
		});

		const input = rendered.getByRole('textbox', { name: 'Alt text' });
		await expect.element(input).toHaveValue('Old');
		await input.fill('A school');
		expect(changes.at(-1)).toEqual({ src: '/media/a.png', alt: 'A school' });
	});

	it('keeps the alt text when the image is replaced', async () => {
		const changes: unknown[] = [];
		const rendered = render(AttributeFieldControl, {
			name: 'cover',
			spec: altSpec,
			value: { src: '/media/a.png', alt: 'A school', focal: { x: 0.2, y: 0.3 } },
			imageSource: { upload: async () => '/media/b.png' },
			imageChoosers: { archive },
			onChange: (next: unknown) => changes.push(next)
		});

		await userEvent.upload(
			rendered.container.querySelector('input[type="file"]')!,
			new File(['x'], 'b.png', { type: 'image/png' })
		);
		await expect.poll(() => changes).toEqual([{ src: '/media/b.png', alt: 'A school' }]);

		await rendered.getByRole('button', { name: 'Choose from the archive' }).click();
		await rendered.getByRole('button', { name: 'Page 2 of b' }).click();
		expect(changes.at(-1)).toEqual({ item: 'b', page: 2, alt: 'A school' });
	});

	it('asks for alt text until the image is marked decorative', async () => {
		const changes: unknown[] = [];
		const rendered = render(AttributeFieldControl, {
			name: 'cover',
			spec: altSpec,
			value: { src: '/media/a.png' },
			onChange: (next: unknown) => changes.push(next)
		});

		await expect
			.element(rendered.getByText('Add alt text, or mark the image decorative.'))
			.toBeInTheDocument();
		await rendered.getByRole('checkbox', { name: /decorative/i }).click();
		expect(changes.at(-1)).toEqual({ src: '/media/a.png', decorative: true });

		await rendered.rerender({ value: { src: '/media/a.png', decorative: true } });
		expect(rendered.container.querySelector('input[aria-label="Alt text"]')).toBeNull();
		expect(rendered.container.querySelector('.uncial-field__error')).toBeNull();
	});

	it('offers no alt text input when the attribute opts out', () => {
		const rendered = render(AttributeFieldControl, {
			name: 'cover',
			spec: { default: null, input: 'image', image: { alt: false } },
			value: { src: '/media/a.png' },
			onChange: () => {}
		});

		expect(rendered.container.querySelector('input[aria-label="Alt text"]')).toBeNull();
	});
});

describe('AttributeFieldControl date', () => {
	it('edits an ISO date with a native date input', async () => {
		const changes: unknown[] = [];
		const rendered = render(AttributeFieldControl, {
			name: 'date',
			spec: { default: '', input: 'date' },
			value: '2026-03-04',
			onChange: (value: unknown) => changes.push(value)
		});

		const input = rendered.container.querySelector<HTMLInputElement>('input[type="date"]');
		expect(input?.value).toBe('2026-03-04');
		input!.value = '2026-05-06';
		input!.dispatchEvent(new Event('change', { bubbles: true }));
		expect(changes).toEqual(['2026-05-06']);
	});
});

describe('AttributeFieldControl datetime', () => {
	it('edits an ISO date-time as a wall clock in its time zone', async () => {
		const changes: unknown[] = [];
		const rendered = render(AttributeFieldControl, {
			name: 'start',
			spec: { default: '', input: 'datetime', timeZone: 'America/Chicago' },
			value: '2026-03-04T19:00:00-06:00',
			onChange: (value: unknown) => changes.push(value)
		});

		const input = rendered.container.querySelector<HTMLInputElement>(
			'input[type="datetime-local"]'
		);
		expect(input?.value).toBe('2026-03-04T19:00');
		input!.value = '2026-05-06T09:30';
		input!.dispatchEvent(new Event('change', { bubbles: true }));
		expect(changes).toEqual(['2026-05-06T09:30:00-05:00']);
	});
});

describe('AttributeFieldControl warn', () => {
	it('shows advice for a value it does not reject', async () => {
		const spec: AttributeSpec<string> = {
			default: '',
			input: 'textarea',
			warn: (value) => (String(value).length > 5 ? 'Keep it short.' : null)
		};
		const short = render(AttributeFieldControl, {
			name: 'summary',
			spec,
			value: 'brief',
			onChange: () => {}
		});
		expect(short.container.querySelector('.uncial-field__warning')).toBeNull();

		const long = render(AttributeFieldControl, {
			name: 'summary',
			spec,
			value: 'too long',
			onChange: () => {}
		});
		expect(long.container.querySelector('.uncial-field__warning')?.textContent).toBe(
			'Keep it short.'
		);
		expect(long.container.querySelector('.uncial-field__error')).toBeNull();
	});
});
