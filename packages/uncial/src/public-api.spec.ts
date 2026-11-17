import { describe, expect, it } from 'vitest';

const valueExports = async (entry: Promise<Record<string, unknown>>) =>
	Object.keys(await entry).sort();

describe('public api', () => {
	it('exports exactly the documented names from each entry point', async () => {
		expect(await valueExports(import('./lib/index.js'))).toEqual([
			'Image',
			'Page',
			'Renderer',
			'RichText',
			'Text',
			'createContentModel',
			'defaultToolbar',
			'defineBlock',
			'defineMark',
			'defineRuntimeBlock',
			'defineTemplate',
			'getBlock',
			'normalizeDocument',
			'resolveImageSrc',
			'toHtml',
			'toPlainText',
			'validateDocument'
		]);
		expect(await valueExports(import('./lib/editor/index.js'))).toEqual([
			'BlockAttributesPanel',
			'DocumentMetaPanel',
			'Editor',
			'Toolbar',
			'bindEditor'
		]);
		expect(await valueExports(import('./lib/web-components/index.js'))).toEqual([
			'UncialEditorElement',
			'UncialRendererElement'
		]);
		expect(await valueExports(import('./lib/internal.js'))).toEqual([
			'AttributeFieldControl',
			'UncialElement',
			'createMetaController'
		]);
	});
});
