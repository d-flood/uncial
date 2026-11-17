import type { FileValue } from '../core/types.js';

/**
 * Where `input: 'file'` values and rich-text Document links come from. The
 * field offers only the actions the host supplies.
 */
export interface FileSource {
	/** Commit a file and answer the value to store. */
	upload?: (file: File) => Promise<FileValue>;
	/** Existing files to choose from. */
	browse?: () => Promise<FileValue[]>;
	/** A URL the editor can open for a stored `src`; identity when absent. */
	href?: (src: string) => string;
}
