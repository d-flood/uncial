/**
 * The wire contract between the `server` forge's client adapter and the host's
 * endpoint built by `createServerContentHandlers`. Types and pure helpers only,
 * so both sides import it without pulling in the other.
 */

export const ACTIONS = [
	'read-draft',
	'save-draft',
	'create',
	'publish',
	'unpublish',
	'delete',
	'move',
	'restore',
	'media-upload',
	'media-delete'
] as const;

export type Action = (typeof ACTIONS)[number];

export interface ServerUser {
	id: string;
	email: string;
	name: string;
}

/** A Content document as the get, create and write endpoints return it. */
export interface ContentView {
	path: string;
	kind: string;
	draft: unknown | null;
	published: unknown | null;
	etag: string;
	publishedAt: string | null;
	updatedAt: string;
	updatedBy: string;
	/** The actions `authorize` grants the requesting user on this record. */
	allowed: Action[];
}

/** One row of the history endpoint, newest first. */
export interface VersionView {
	id: string;
	createdAt: string;
	createdBy: string;
}

export type ContentStatus = 'draft' | 'published' | 'changed';

/** One row of the list endpoint. */
export interface ContentSummary {
	path: string;
	kind: string;
	status: ContentStatus;
	publishedAt: string | null;
	updatedAt: string;
	updatedBy: string;
}

export function contentStatus(hasDraft: boolean, hasPublished: boolean): ContentStatus {
	if (!hasPublished) return 'draft';
	return hasDraft ? 'changed' : 'published';
}

export function describeContentStatus(status: ContentStatus): string {
	if (status === 'draft') return 'Draft only';
	return status === 'published' ? 'Published' : 'Published with Draft changes';
}

/** One Media item as the media endpoint returns it. */
export interface MediaItemView {
	id: string;
	key: string;
	url: string;
	filename: string;
	title: string;
	contentType: string;
	width: number | null;
	height: number | null;
	size: number;
	uploadedBy: string;
	uploadedAt: string;
}

/** The media list endpoint's body. */
export interface MediaListView {
	items: Array<MediaItemView & { usage: number }>;
	/** Of `media-upload` and `media-delete`, the actions `authorize` grants the requesting user. */
	allowed: Action[];
}
