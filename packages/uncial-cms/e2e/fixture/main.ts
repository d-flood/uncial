import { mountEditorPage, type UncialCmsSiteConfig } from '../../src/lib/index.js';
import { createBlockRegistry, createSchema } from 'uncial/core';

const params = new URLSearchParams(location.search);

const config: UncialCmsSiteConfig = {
	forge: 'github',
	repo: params.get('repo') ?? 'octo/site',
	branch: params.get('branch') ?? 'main',
	contentDir: 'content',
	authWorkerUrl: '',
	appSlug: 'uncial-cms'
};

const registry = createBlockRegistry([]);
const schema = createSchema(registry);

mountEditorPage(document.getElementById('editor-page')!, {
	config,
	sourcePath: params.get('path') ?? 'content/fixture.json',
	blocks: registry,
	schema
});
