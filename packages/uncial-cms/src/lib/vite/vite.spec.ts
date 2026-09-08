import { describe, expect, it } from 'vitest';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import { FORGE_DEFINE_KEY, uncialCms } from './index.js';

const options = { contentDir: 'content' };
const github = { repo: 'd-flood/uncial', branch: 'main' };

/** The hook out of Vite's plugin context, which supplies nothing this hook reads. */
type ConfigHook = (config: UserConfig, env: ConfigEnv) => UserConfig | undefined;

function defineFor(plugin: Plugin, command: 'serve' | 'build'): unknown {
	if (typeof plugin.config !== 'function') {
		throw new Error('The forge plugin must expose a functional Vite config hook.');
	}
	const mode = command === 'serve' ? 'development' : 'production';
	return (plugin.config as ConfigHook)({}, { command, mode })?.define?.[FORGE_DEFINE_KEY];
}

describe('uncialCms', () => {
	it('ships the local file plugin alongside the forge define', () => {
		const plugins = uncialCms(options);

		expect(plugins.map((plugin) => plugin.name)).toEqual(['uncial-cms:local', 'uncial-cms:forge']);
	});

	it('defines UNCIAL_CMS_FORGE as the forge the build targets', () => {
		const [, forgePlugin] = uncialCms({ ...options, github });
		const [, localOnlyPlugin] = uncialCms(options);

		expect(defineFor(forgePlugin, 'serve')).toBe('"local"');
		expect(defineFor(forgePlugin, 'build')).toBe('"github"');
		expect(defineFor(localOnlyPlugin, 'serve')).toBe('"local"');
		expect(defineFor(localOnlyPlugin, 'build')).toBe('"none"');
	});
});
