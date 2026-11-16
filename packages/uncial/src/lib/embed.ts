import { defineSvelteBlock } from './runtime/svelte.js';
import Embed from './render/Embed.svelte';

export const embedBlock = defineSvelteBlock({
	id: 'embed',
	label: 'Embed',
	description: 'A YouTube or Vimeo player, or a link for any other URL.',
	attributes: {
		url: { default: '', required: true, placeholder: 'https://www.youtube.com/watch?v=…' },
		title: { default: '', placeholder: 'What the embed shows, for screen readers' }
	},
	component: Embed
});
