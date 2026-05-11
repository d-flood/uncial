import type { AttributeSpec } from '../core/types.js';

export const CODE_BLOCK_ID = 'codeBlock';

export const CODE_BLOCK_LANGUAGE_OPTIONS = [
	{ value: '', label: 'Auto' },
	{ value: 'ts', label: 'TypeScript' },
	{ value: 'js', label: 'JavaScript' },
	{ value: 'svelte', label: 'Svelte' },
	{ value: 'python', label: 'Python' },
	{ value: 'html', label: 'HTML' },
	{ value: 'css', label: 'CSS' },
	{ value: 'json', label: 'JSON' },
	{ value: 'bash', label: 'Bash' }
];

export const codeBlockAttributes = {
	language: {
		default: '',
		input: 'select',
		options: CODE_BLOCK_LANGUAGE_OPTIONS,
		parse: (value: unknown) => (typeof value === 'string' ? value : '')
	}
} satisfies Record<string, AttributeSpec<unknown>>;

export const codeBlockAttributeTarget = {
	id: CODE_BLOCK_ID,
	label: 'Code block',
	attributes: codeBlockAttributes
};
