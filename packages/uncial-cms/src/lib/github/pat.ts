import { GITHUB_API_URL } from './adapter.js';
import type { SessionProvider } from '../types.js';

/**
 * Zero-backend session provider: prompts for a fine-grained personal access
 * token and validates it via `GET /user`. The permanent dev/self-service auth
 * mode; the worker-based provider (issue 03) is layered on the same seam.
 */
export const patSessionProvider: SessionProvider = async (config) => {
	const token = window
		.prompt(
			`Paste a GitHub personal access token with contents read/write access to ${config.repo}:`
		)
		?.trim();
	if (!token) throw new Error('A personal access token is required to edit this page.');

	const response = await fetch(`${GITHUB_API_URL}/user`, {
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});
	if (!response.ok) {
		throw new Error(`GitHub rejected the personal access token (${response.status}).`);
	}

	const user = (await response.json()) as { login: string; id: number; name: string | null };
	return {
		token,
		expiresAt: null,
		repo: config.repo,
		user: {
			login: user.login,
			name: user.name ?? user.login,
			email: `${user.id}+${user.login}@users.noreply.github.com`
		}
	};
};
