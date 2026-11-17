const trimSlashes = (path: string) => path.replace(/^\/+|\/+$/g, '');

/**
 * The repository root the forge's paths are relative to. `contentDir` names the
 * content directory from the repository root, `localContentDir` names the same
 * directory on disk, so stripping the former's segments off the latter leaves
 * the root above both.
 */
export function repositoryRoot(contentDir: string, localContentDir = contentDir): string {
	const { resolve } = process.getBuiltinModule('node:path');
	const dir = trimSlashes(contentDir);
	const local = resolve(localContentDir);
	const depth = dir === '' ? 0 : dir.split('/').length;
	const root = resolve(local, ...Array.from({ length: depth }, () => '..'));
	if (resolve(root, dir) !== local) {
		throw new Error(
			`localContentDir must be where contentDir sits on disk: "${local}" does not end with "${dir}".`
		);
	}
	return root;
}
