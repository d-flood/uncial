/**
 * Where an `input: 'image'` attribute's values come from. The field offers
 * only the actions the host supplies.
 */
export interface ImageSource {
	/** Commit a file and answer the value to store. */
	upload?: (file: File) => Promise<string>;
	/** Values of existing images to choose from. */
	browse?: () => Promise<string[]>;
	/** A displayable URL for a stored value; identity when absent. */
	thumbnail?: (src: string) => string;
}
