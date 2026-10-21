import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { defineSvelteBlock } from '../runtime/svelte.js';
import EditorBlockFixture from '../shared/EditorBlockFixture.svelte';
import BlockMenu from './BlockMenu.svelte';

it('leaves blocks that are not insertable out of the menu', () => {
	const blocks = [
		defineSvelteBlock({ id: 'note', label: 'Note', attributes: {}, component: EditorBlockFixture }),
		defineSvelteBlock({
			id: 'column',
			label: 'Column',
			insertable: false,
			attributes: {},
			component: EditorBlockFixture
		})
	];
	const menu = render(BlockMenu, { blocks });
	expect(
		Array.from(menu.container.querySelectorAll('button')).map((button) =>
			button.textContent?.trim()
		)
	).toEqual(['Note']);
});
