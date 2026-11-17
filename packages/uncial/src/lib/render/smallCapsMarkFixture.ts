import { defineMark } from '../model.js';
import SmallCapsMarkFixture from './SmallCapsMarkFixture.svelte';

export const smallCaps = defineMark({
	id: 'smallCaps',
	extension: async () =>
		(await import('@tiptap/core')).Mark.create({
			name: 'smallCaps',
			parseHTML: () => [{ tag: 'span[data-small-caps]' }],
			renderHTML: () => ['span', { 'data-small-caps': '' }, 0]
		}),
	component: SmallCapsMarkFixture,
	toolbar: { label: 'Small caps' }
});
