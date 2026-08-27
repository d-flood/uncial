import { defineSvelteBlock } from './runtime/svelte.js';
import Tab from './render/Tab.svelte';
import Tabs from './render/Tabs.svelte';

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export const tabsBlock = defineSvelteBlock({
	id: 'tabs',
	label: 'Tabs',
	description: 'A linked group of labelled content tabs.',
	attributes: {
		group: {
			default: '',
			required: true,
			validate: isNonEmptyString,
			placeholder: 'framework'
		}
	},
	component: Tabs,
	content: { kind: 'flow' }
});

export const tabBlock = defineSvelteBlock({
	id: 'tab',
	label: 'Tab',
	description: 'One labelled panel inside a tabs block.',
	attributes: {
		label: {
			default: '',
			required: true,
			validate: isNonEmptyString,
			placeholder: 'Vue'
		}
	},
	component: Tab,
	content: { kind: 'flow' }
});
