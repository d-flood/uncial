export interface WagtailImageReference {
	kind: 'wagtail.image';
	id: number;
	rendition: string;
	url: string;
	width?: number;
	height?: number;
	alt?: string;
	title?: string;
}

export type UncialReference = WagtailImageReference;
export type UncialReferenceMap = Record<string, UncialReference | undefined>;

export function imageReferenceKey(imageId: number, rendition = 'width-1200') {
	return `wagtail.image:${imageId}:${rendition}`;
}
