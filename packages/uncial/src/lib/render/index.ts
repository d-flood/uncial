export { default as Renderer } from './Renderer.svelte';
export { default as RichText } from './RichText.svelte';
export { default as Tab } from './Tab.svelte';
export { default as Tabs } from './Tabs.svelte';
// A consumer's own code block — one built from a component rather than placed in
// a document — has to read the same as a fence the renderer produced, so the
// highlighter the renderer uses is part of the render surface.
export {
	getCodeLanguageClass,
	highlightCodeToHtml
} from '../shared/syntaxHighlight.js';
