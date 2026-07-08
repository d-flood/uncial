export interface UncialCmsSiteConfig {
	forge: 'github';
	repo: string; // 'owner/name'
	branch: string; // commit target
	contentDir: string; // repo-root-relative, e.g. 'packages/uncial-cms/content'
	authWorkerUrl: string; // unused by the PAT provider; required in the config shape
	appSlug: string;
}

export interface ForgeSession {
	token: string;
	expiresAt: number | null; // null = unknown lifetime (PAT)
	repo: string;
	user: { login: string; name: string; email: string }; // email: GitHub noreply form
}

export type SessionProvider = (config: UncialCmsSiteConfig) => Promise<ForgeSession>;

export interface ForgeAdapter {
	authenticate(config: UncialCmsSiteConfig, provider: SessionProvider): Promise<ForgeSession>;
	readFile(path: string): Promise<{ content: string; sha: string }>;
	writeFile(
		path: string,
		content: string | Uint8Array,
		opts: {
			message: string;
			sha?: string; // absent = create; stale → ConflictError
			author: { name: string; email: string };
		}
	): Promise<{ sha: string; commitSha: string }>;
	deleteFile(path: string, opts: { message: string; sha: string }): Promise<void>;
	listDir(path: string): Promise<Array<{ path: string; type: 'file' | 'dir' }>>;
	commitStatus(commitSha: string): Promise<'pending' | 'success' | 'failure' | 'unknown'>;
}
