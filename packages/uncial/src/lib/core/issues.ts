import type { ValidateDocumentOptions, ValidationIssue } from './types.js';

/**
 * Appends a validation issue to the running list and forwards it to the optional
 * `onIssue` sink. Previously duplicated byte-for-byte in `validate.ts` and
 * `meta.ts`; kept as one shared internal helper.
 */
export function pushIssue(
	issues: ValidationIssue[],
	options: ValidateDocumentOptions | undefined,
	issue: ValidationIssue
): void {
	issues.push(issue);
	options?.onIssue?.(issue);
}
