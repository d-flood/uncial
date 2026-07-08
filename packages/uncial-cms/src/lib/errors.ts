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
