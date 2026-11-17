import type { PMDoc } from '../shared/document.js';
import { stampDocumentIdentity } from '../shared/documentIdentity.js';

/**
 * The document version stamped onto documents produced by `normalizeDocument`.
 * Bump this when the persisted document shape changes, and register a
 * migration for each intermediate version so older documents can be upgraded.
 */
export const CURRENT_DOCUMENT_VERSION = 2;

const migrations = new Map<number, (document: PMDoc) => PMDoc>([[1, stampDocumentIdentity]]);

/**
 * Runs registered migrations stepwise from `fromVersion` up to `toVersion`
 * (defaults to CURRENT_DOCUMENT_VERSION). Versions without a registered
 * migration are passed through unchanged. The `version` field is not
 * stamped here; callers such as `normalizeDocument` stamp the result.
 *
 * Only the registered migration versions inside `[fromVersion, toVersion)`
 * are visited (in ascending order), so hostile version ranges from untrusted
 * documents cannot make this loop over billions of integers.
 */
export function runDocumentMigrations(
	document: PMDoc,
	fromVersion: number,
	toVersion: number = CURRENT_DOCUMENT_VERSION
): PMDoc {
	const applicable = [...migrations.entries()]
		.filter(([version]) => version >= fromVersion && version < toVersion)
		.sort(([a], [b]) => a - b);

	let migrated = document;
	for (const [, migrate] of applicable) {
		migrated = migrate(migrated);
	}

	return migrated;
}
