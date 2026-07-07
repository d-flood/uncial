/** Thrown ONLY when a write is rejected because the provided sha is stale. */
export class ConflictError extends Error {
	constructor(message = 'The document changed on the server since it was loaded.') {
		super(message);
		this.name = 'ConflictError';
	}
}
