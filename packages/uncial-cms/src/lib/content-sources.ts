/** Build-time enumeration of a content directory, shared by the framework route factories. Node only. */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every `.json` file under the local content dir, content-dir-relative and sorted. */
export function listContentSources(localContentDir: string, prefix = ''): string[] {
	const sources: string[] = [];
	for (const entry of readdirSync(join(localContentDir, prefix), { withFileTypes: true })) {
		const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isDirectory()) sources.push(...listContentSources(localContentDir, rel));
		else if (entry.isFile() && entry.name.endsWith('.json')) sources.push(rel);
	}
	return sources.sort();
}
