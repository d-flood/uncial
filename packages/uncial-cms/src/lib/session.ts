import type { ForgeSession } from './types.js';

function storageKey(repo: string): string {
	return `uncial-cms:session:${repo}`;
}

function storage(): Storage | null {
	return typeof sessionStorage === 'undefined' ? null : sessionStorage;
}

export function readCachedSession(repo: string): ForgeSession | null {
	const raw = storage()?.getItem(storageKey(repo));
	if (!raw) return null;

	let session: ForgeSession;
	try {
		session = JSON.parse(raw) as ForgeSession;
	} catch {
		clearCachedSession(repo);
		return null;
	}

	if (session.expiresAt !== null && session.expiresAt <= Date.now()) {
		clearCachedSession(repo);
		return null;
	}

	return session;
}

export function writeCachedSession(session: ForgeSession): void {
	storage()?.setItem(storageKey(session.repo), JSON.stringify(session));
}

export function clearCachedSession(repo: string): void {
	storage()?.removeItem(storageKey(repo));
}
