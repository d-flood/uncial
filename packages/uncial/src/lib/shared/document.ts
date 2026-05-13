export interface PMMark {
	type: string;
	attrs?: Record<string, unknown>;
}

export interface PMNode {
	type: string;
	attrs?: Record<string, unknown>;
	marks?: PMMark[];
	text?: string;
	content?: PMNode[];
}

export interface PMDoc {
	type: 'doc';
	version?: number;
	meta?: Record<string, unknown>;
	content?: PMNode[];
}

export type PMPathSegment = number | 'attrs' | 'marks' | 'content' | 'text' | string;

export type PMPath = PMPathSegment[];
