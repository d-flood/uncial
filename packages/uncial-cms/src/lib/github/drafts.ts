import type { ForgeAdapter } from '../types.js';

export const DRAFT_BRANCH_PREFIX = 'uncial/drafts/';

/** The branch holding a page's Draft: `uncial/drafts/<page path, '/' → '__'>`; the root is `index`. */
export function draftBranch(pagePath: string): string {
	const path = pagePath.replace(/^\/+|\/+$/g, '');
	return DRAFT_BRANCH_PREFIX + (path === '' ? 'index' : path.replaceAll('/', '__'));
}

/** What a GitHub site with `drafts` needs beyond {@link ForgeAdapter}: Drafts on branches. */
export interface DraftForge extends ForgeAdapter {
	/** The branch's tip, or null when it does not exist. */
	branchTip(branch: string): Promise<string | null>;
	/** Create `branch` at the configured branch's tip; false when it already existed. */
	createDraftBranch(branch: string): Promise<boolean>;
	deleteBranch(branch: string): Promise<void>;
	/** Names of the branches starting with {@link DRAFT_BRANCH_PREFIX}. */
	listDraftBranches(): Promise<string[]>;
	readFileOn(branch: string, path: string): Promise<{ content: string; sha: string }>;
	writeFileOn(
		branch: string,
		path: string,
		content: string,
		opts: { message: string; sha?: string; author: { name: string; email: string } }
	): Promise<{ sha: string; commitSha: string }>;
	/**
	 * Bring `branch` into the configured branch: fast-forward when possible,
	 * otherwise a merge commit. Throws `ConflictError` when the configured branch
	 * changed `path` since `branch` left it. Returns the new tip, or null when
	 * `branch` held nothing to bring.
	 */
	publishBranch(branch: string, opts: { path: string; message: string }): Promise<string | null>;
}
