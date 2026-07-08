import type { PMDoc } from '../shared/document.js';

/**
 * The document version stamped onto documents produced by `normalizeDocument`.
 * Bump this when the persisted document shape changes, and register a
 * migration for each intermediate version so older documents can be upgraded.
 */
export const CURRENT_DOCUMENT_VERSION = 1;

export interface DocumentMigration {
	/** The document version this migration upgrades from (to `from + 1`). */
	from: number;
	/** Upgrades a document from version `from` to version `from + 1`. */
	migrate: (document: PMDoc) => PMDoc;
}

const migrations = new Map<number, DocumentMigration['migrate']>();

/**
 * Registers a migration that upgrades documents from version `from` to
 * `from + 1`. Returns a disposer that removes the registration (useful for
 * tests and hot-reload scenarios).
 */
export function registerDocumentMigration(migration: DocumentMigration): () => void {
	if (!Number.isInteger(migration.from)) {
		throw new Error(`Document migration "from" must be an integer, got ${migration.from}`);
	}

	migrations.set(migration.from, migration.migrate);

	return () => {
		if (migrations.get(migration.from) === migration.migrate) {
			migrations.delete(migration.from);
		}
	};
}

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
