import { describe, expect, it } from 'vitest';
import {
	CURRENT_DOCUMENT_VERSION,
	createBlockRegistry,
	createSchema,
	normalizeDocument,
	registerDocumentMigration,
	runDocumentMigrations
} from './index.js';
import { migrateDocument } from './normalize.js';
import { defineSvelteBlock } from '../runtime/svelte.js';
import type { PMDoc } from '../shared/document.js';
import type { Component } from 'svelte';

const Dummy = (() => ({})) as unknown as Component<Record<string, unknown>>;

describe('normalizeDocument', () => {
	it('coerces typed attrs and strips unknown block attrs', () => {
		const profile = defineSvelteBlock({
			id: 'profile',
			label: 'Profile',
			attributes: {
				name: '',
				featured: false,
				order: 0,
				metadata: { default: { tone: 'warm' }, input: 'json' }
			},
			component: Dummy
		});

		const registry = createBlockRegistry([profile]);
		const schema = createSchema(registry);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'profile',
						attrs: {
							name: 42,
							featured: 'true',
							order: '7',
							metadata: '{"tone":"cool"}',
							ignored: 'nope'
						}
					}
				]
			},
			registry,
			schema
		);

		expect(normalized.content?.[0]?.attrs).toEqual({
			name: '42',
			featured: true,
			order: 7,
			metadata: { tone: 'cool' }
		});
	});

	it('filters disallowed marks while preserving the document shape', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry, { allowedMarks: ['bold'] });
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: 'Hello',
								marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }]
							}
						]
					}
				]
			},
			registry,
			schema
		);

		expect(normalized.content?.[0]?.content?.[0]?.marks).toEqual([{ type: 'bold' }]);
	});

	it('strips child content from atomic custom blocks', () => {
		const note = defineSvelteBlock({
			id: 'note',
			label: 'Note',
			attributes: { title: '' },
			component: Dummy
		});

		const registry = createBlockRegistry([note]);
		const schema = createSchema(registry);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'note',
						attrs: { title: 'Atomic' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ignored' }] }]
					}
				]
			},
			registry,
			schema
		);

		expect(normalized.content?.[0]?.content).toBeUndefined();
	});

	it('normalizes declared document metadata and drops unknown keys', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry, {
			metaFields: {
				title: { default: '', required: true },
				published: { default: false },
				tags: { default: [] as string[], input: 'json' }
			}
		});

		const normalized = normalizeDocument(
			{
				type: 'doc',
				meta: {
					title: 42,
					published: 'true',
					tags: '["demo","typed"]',
					ignored: 'nope'
				},
				content: []
			},
			registry,
			schema
		);

		expect(normalized.meta).toEqual({
			title: '42',
			published: true,
			tags: ['demo', 'typed']
		});
	});

	it('omits metadata when no metadata schema is supplied', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry);

		const normalized = normalizeDocument(
			{ type: 'doc', meta: { title: 'Draft' }, content: [] },
			registry,
			schema
		);

		expect(normalized).not.toHaveProperty('meta');
	});

	it('preserves child content for container custom blocks', () => {
		const collapsible = defineSvelteBlock({
			id: 'collapsible',
			label: 'Collapsible',
			attributes: { title: '' },
			component: Dummy,
			content: { kind: 'flow' }
		});

		const registry = createBlockRegistry([collapsible]);
		const schema = createSchema(registry);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'collapsible',
						attrs: { title: 'Details' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }]
					}
				]
			},
			registry,
			schema
		);

		expect(normalized.content?.[0]?.content).toEqual([
			{
				type: 'paragraph',
				content: [{ type: 'text', text: 'Nested' }]
			}
		]);
	});

	it('drops null and primitive nodes from content without throwing', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [null, 42, 'garbage', true, { type: 'paragraph' }, {}]
			} as unknown as Partial<PMDoc>,
			registry,
			schema
		);

		expect(normalized.content).toEqual([{ type: 'paragraph' }]);
	});

	it('coerces non-array marks, non-array content, and non-object attrs', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry, { allowedMarks: ['bold'] });
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{ type: 'paragraph', marks: 'bold', content: 'not-an-array', attrs: 7 },
					{
						type: 'paragraph',
						content: [{ type: 'text', text: 'Hi', marks: [null, 'bold', { type: 'bold' }] }]
					}
				]
			} as unknown as Partial<PMDoc>,
			registry,
			schema
		);

		expect(normalized.content?.[0]).toEqual({ type: 'paragraph' });
		expect(normalized.content?.[1]?.content?.[0]?.marks).toEqual([{ type: 'bold' }]);
	});

	it('applies attribute defaults when a custom block has non-object attrs', () => {
		const note = defineSvelteBlock({
			id: 'note',
			label: 'Note',
			attributes: { title: 'Untitled' },
			component: Dummy
		});

		const registry = createBlockRegistry([note]);
		const schema = createSchema(registry);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [{ type: 'note', attrs: 'nope' }]
			} as unknown as Partial<PMDoc>,
			registry,
			schema
		);

		expect(normalized.content?.[0]?.attrs).toEqual({ title: 'Untitled' });
	});

	it('drops marks with non-object attrs values while keeping the mark', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry, { allowedMarks: ['bold'] });
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'text', text: 'Hi', marks: [{ type: 'bold', attrs: 'nope' }] }]
					}
				]
			} as unknown as Partial<PMDoc>,
			registry,
			schema
		);

		expect(normalized.content?.[0]?.content?.[0]?.marks).toEqual([{ type: 'bold' }]);
	});

	it('survives deeply nested garbage without throwing', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'blockquote',
						content: [
							null,
							{
								type: 'paragraph',
								attrs: [],
								marks: {},
								content: [
									undefined,
									{ type: 42 },
									{ type: 'text', text: 'Kept', marks: [{ type: null }, 0] }
								]
							}
						]
					}
				]
			} as unknown as Partial<PMDoc>,
			registry,
			schema
		);

		expect(normalized.content).toEqual([
			{
				type: 'blockquote',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kept' }] }]
			}
		]);
	});

	it('drops text nodes whose text is missing, non-string, or empty', () => {
		// ProseMirror's nodeFromJSON throws on these ("Invalid text node in
		// JSON" / "Empty text nodes are not allowed"), which makes Tiptap v3
		// silently replace the entire document with empty content.
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{ type: 'text' },
							{ type: 'text', text: '' },
							{ type: 'text', text: 42 },
							{ type: 'text', text: null },
							{ type: 'text', text: 'Kept' }
						]
					}
				]
			} as unknown as Partial<PMDoc>,
			registry,
			schema
		);

		expect(normalized.content).toEqual([
			{ type: 'paragraph', content: [{ type: 'text', text: 'Kept' }] }
		]);
	});

	it('filters unknown mark types when no schema is passed', () => {
		// Unknown marks also crash ProseMirror's nodeFromJSON; without a schema
		// the registry's default allowed-mark set applies.
		const registry = createBlockRegistry([]);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: 'Hi',
								marks: [{ type: 'nonexistent' }, { type: 'bold' }, { type: 'link' }]
							}
						]
					}
				]
			},
			registry
		);

		expect(normalized.content?.[0]?.content?.[0]?.marks).toEqual([
			{ type: 'bold' },
			{ type: 'link' }
		]);
	});

	it('normalizes non-object documents to an empty doc', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry);

		for (const input of [null, undefined, 'garbage', 42, []] as unknown[]) {
			expect(normalizeDocument(input as Partial<PMDoc> | null | undefined, registry, schema)).toEqual({
				type: 'doc',
				version: CURRENT_DOCUMENT_VERSION,
				content: []
			});
		}
	});
});

describe('document versioning', () => {
	const registry = createBlockRegistry([]);
	const schema = createSchema(registry);

	it('stamps the current version when the version is missing or not a positive integer', () => {
		// Hostile numeric versions (e.g. -1e15) must normalize instantly: the
		// migration runner only visits registered migration versions, never
		// every integer in an attacker-supplied range.
		const bogusVersions = [
			undefined,
			null,
			'2',
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			0,
			-1,
			-1e9,
			-1e15,
			1.5,
			1e300
		] as unknown[];

		for (const version of bogusVersions) {
			const normalized = normalizeDocument(
				{ type: 'doc', version, content: [{ type: 'paragraph' }] } as unknown as Partial<PMDoc>,
				registry,
				schema
			);
			expect(normalized.version).toBe(CURRENT_DOCUMENT_VERSION);
			expect(normalized.content).toEqual([{ type: 'paragraph' }]);
		}
	});

	it('keeps documents already at the current version stamped as current', () => {
		const normalized = normalizeDocument(
			{ type: 'doc', version: CURRENT_DOCUMENT_VERSION, content: [] },
			registry,
			schema
		);

		expect(normalized.version).toBe(CURRENT_DOCUMENT_VERSION);
	});

	it('treats version 0 like a missing version and does not run migrations', () => {
		// Versions were never stamped below 1, so 0 (like any other bogus
		// value) means "unversioned" and must not open a migration range.
		const calls: number[] = [];
		const unregister = registerDocumentMigration({
			from: 0,
			migrate: (document) => {
				calls.push(0);
				return document;
			}
		});

		try {
			const normalized = normalizeDocument(
				{ type: 'doc', version: 0, content: [{ type: 'paragraph' }] },
				registry,
				schema
			);

			expect(calls).toEqual([]);
			expect(normalized.version).toBe(CURRENT_DOCUMENT_VERSION);
			expect(normalized.content).toEqual([{ type: 'paragraph' }]);
		} finally {
			unregister();
		}
	});

	it('applies registered migrations to older documents', () => {
		const unregister = registerDocumentMigration({
			from: 1,
			migrate: (document) => ({
				...document,
				content: (document.content ?? []).map((node) =>
					node.type === 'legacyParagraph' ? { ...node, type: 'paragraph' } : node
				)
			})
		});

		try {
			const migrated = migrateDocument(
				{ type: 'doc', content: [{ type: 'legacyParagraph' }] },
				1,
				2
			);

			expect(migrated.content).toEqual([{ type: 'paragraph' }]);
		} finally {
			unregister();
		}
	});

	it('sanitizes hostile shapes before handing the document to migrations', () => {
		let seen: PMDoc | undefined;
		const unregister = registerDocumentMigration({
			from: 1,
			migrate: (document) => {
				seen = document;
				return document;
			}
		});

		try {
			migrateDocument(
				{
					type: 'doc',
					meta: 'garbage',
					content: [
						null,
						'garbage',
						{ type: 42 },
						{ type: 'paragraph', attrs: 7, marks: 'bold', content: 'nope' },
						{ type: 'text' },
						// Legacy marks survive shape sanitization so migrations can
						// rewrite them; the post-migration pass filters marks.
						{ type: 'text', text: 'Kept', marks: [{ type: 'legacy' }, 0] }
					]
				} as unknown as Partial<PMDoc>,
				1,
				2
			);

			expect(seen).toEqual({
				type: 'doc',
				content: [
					{ type: 'paragraph' },
					{ type: 'text', text: 'Kept', marks: [{ type: 'legacy' }] }
				]
			});
		} finally {
			unregister();
		}
	});

	it('recovers the sanitized document when a migration throws', () => {
		const unregister = registerDocumentMigration({
			from: 1,
			migrate: () => {
				throw new Error('boom');
			}
		});

		try {
			const migrated = migrateDocument({ type: 'doc', content: [{ type: 'paragraph' }] }, 1, 2);

			expect(migrated).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
		} finally {
			unregister();
		}
	});

	it('runs migrations stepwise through intermediate versions', () => {
		const trail: number[] = [];
		const tag = (from: number) =>
			registerDocumentMigration({
				from,
				migrate: (document) => {
					trail.push(from);
					return document;
				}
			});
		const unregisterFirst = tag(1);
		const unregisterSecond = tag(2);

		try {
			const doc: PMDoc = { type: 'doc', content: [] };
			runDocumentMigrations(doc, 1, 3);
			expect(trail).toEqual([1, 2]);

			trail.length = 0;
			runDocumentMigrations(doc, 2, 3);
			expect(trail).toEqual([2]);

			trail.length = 0;
			runDocumentMigrations(doc, 3, 3);
			expect(trail).toEqual([]);
		} finally {
			unregisterFirst();
			unregisterSecond();
		}
	});

	it('visits only registered migrations in ascending order, even for huge ranges', () => {
		// A hostile fromVersion like -1e15 must not iterate per-integer; only
		// the registered versions inside the range run (this test would hang
		// for hours if the runner looped over the whole range).
		const trail: number[] = [];
		const tag = (from: number) =>
			registerDocumentMigration({
				from,
				migrate: (document) => {
					trail.push(from);
					return document;
				}
			});
		const unregisterLate = tag(5);
		const unregisterEarly = tag(-7);
		const unregisterOutside = tag(9);

		try {
			runDocumentMigrations({ type: 'doc', content: [] }, -1e15, 8);
			expect(trail).toEqual([-7, 5]);
		} finally {
			unregisterLate();
			unregisterEarly();
			unregisterOutside();
		}
	});

	it('preserves the version of future documents instead of downgrading them', () => {
		// Note on bindEditor semantics: bindEditor strips `version` before
		// handing the document to Tiptap and re-normalizes the editor's JSON on
		// every update, so after any edit the document is re-stamped CURRENT.
		// The host is warned about the future version via UNSUPPORTED_VERSION
		// on load.
		const futureVersion = CURRENT_DOCUMENT_VERSION + 5;
		const normalized = normalizeDocument(
			{ type: 'doc', version: futureVersion, content: [{ type: 'paragraph' }] },
			registry,
			schema
		);

		expect(normalized.version).toBe(futureVersion);
		expect(normalized.content).toEqual([{ type: 'paragraph' }]);
	});
});
