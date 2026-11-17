/**
 * The GitHub Contents API rejects file payloads larger than ~1 MB. Document
 * reads and writes share this ceiling; larger uploads go through the Git Data
 * API instead.
 */
export const MAX_CONTENT_BYTES = 1024 * 1024;

/** The largest image original an upload commits; `fit` re-encodes anything larger. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** The largest file, such as a PDF Document, an upload commits. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
