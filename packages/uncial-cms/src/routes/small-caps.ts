import { Mark } from '@tiptap/core';

export default Mark.create({
	name: 'smallCaps',
	parseHTML: () => [{ tag: 'span[data-small-caps]' }],
	renderHTML: () => ['span', { 'data-small-caps': '', style: 'font-variant: small-caps' }, 0]
});
