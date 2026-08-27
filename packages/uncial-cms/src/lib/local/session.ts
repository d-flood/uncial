import type { ForgeSession, SessionProvider } from '../types.js';

const localSession: ForgeSession = {
	token: 'local',
	expiresAt: null,
	repo: 'local',
	user: { login: 'local', name: 'Local editor', email: 'local@localhost' }
};

export const localSessionProvider: SessionProvider = async (config) => {
	if (config.forge !== 'local') {
		throw new Error('The local session provider requires a local site configuration.');
	}
	return localSession;
};
