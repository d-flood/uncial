import type { SessionProvider } from '../types.js';
import { serverRequest } from './adapter.js';
import type { ServerUser } from './protocol.js';

export const serverSessionProvider: SessionProvider = async (config) => {
	if (config.forge !== 'server') {
		throw new Error('The server session provider requires a server site configuration.');
	}
	const { user } = await serverRequest<{ user: ServerUser }>(config.apiBase, 'GET', {
		query: { session: '' }
	});
	return {
		token: '',
		expiresAt: null,
		repo: config.apiBase,
		user: { login: user.email, name: user.name, email: user.email }
	};
};
