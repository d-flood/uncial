/** Thrown ONLY when a write is rejected because the provided sha is stale. */
export class ConflictError extends Error {
	constructor(message = 'The document changed on the server since it was loaded.') {
		super(message);
		this.name = 'ConflictError';
	}
}

/** Thrown when a forge read targets a path that does not exist (404). */
export class NotFoundError extends Error {
	constructor(message = 'The requested file does not exist.') {
		super(message);
		this.name = 'NotFoundError';
	}
}

export class MediaInUseError extends Error {
	constructor(readonly usage: { count: number; paths: string[] }) {
		super(
			`This Media item is used by ${usage.count} Content document${usage.count === 1 ? '' : 's'}: ${usage.paths.join(', ')}.`
		);
		this.name = 'MediaInUseError';
	}
}

export class SignedOutError extends Error {
	constructor(message = 'You are signed out. Sign in again to keep editing.') {
		super(message);
		this.name = 'SignedOutError';
	}
}
