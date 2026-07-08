import type {
	BlockDefinition,
	BlockMetadata,
	BlockRegistry,
	ContentSchema,
	CreateSchemaOptions
} from './types.js';

/**
 * The default mark universe a schema allows when the host does not pass an
 * explicit `allowedMarks`. This is the single source of truth for the default
 * marks — the editor's base extensions (`shared/tiptap.ts`) consume it too, so
 * the fallback schema and the fallback extension set never drift apart.
 */
export const DEFAULT_MARKS = ['bold', 'italic', 'strike', 'code', 'link'] as const;

export function createBlockRegistry(blocks: BlockDefinition[]): BlockRegistry {
	const byId = new Map<string, BlockDefinition>();
	const metadata: BlockMetadata[] = [];
	const runtimes = new Set<string>();

	for (const block of blocks) {
		if (byId.has(block.id)) {
			throw new Error(`Duplicate block id "${block.id}"`);
		}

		runtimes.add(block.runtime);
		if (runtimes.size > 1) {
			throw new Error('Block registries cannot mix runtimes in this release');
		}

		byId.set(block.id, block);
		metadata.push({
			id: block.id,
			label: block.label,
			description: block.description,
			icon: block.icon
		});
	}

	return {
		blocks,
		byId,
		metadata,
		get(id: string) {
			return byId.get(id);
		},
		has(id: string) {
			return byId.has(id);
		}
	};
}

export function createSchema(
	registry: BlockRegistry,
	options: CreateSchemaOptions = {}
): ContentSchema {
	let allowedBlocks: Set<string>;
	if (options.allowedBlocks) {
		const unknown = options.allowedBlocks.filter((id: string) => !registry.has(id));
		if (unknown.length > 0) {
			console.warn(
				`createSchema: ignoring unknown block id(s) in allowedBlocks: ${unknown
					.map((id) => `"${id}"`)
					.join(', ')}. Known ids: ${registry.blocks
					.map((block: BlockDefinition) => `"${block.id}"`)
					.join(', ')}.`
			);
		}
		allowedBlocks = new Set(options.allowedBlocks.filter((id: string) => registry.has(id)));
	} else {
		allowedBlocks = new Set(registry.blocks.map((block: BlockDefinition) => block.id));
	}

	const allowedMarks = new Set(options.allowedMarks ?? DEFAULT_MARKS);
	const metaFields = new Map(Object.entries(options.metaFields ?? {}));

	return {
		allowedBlocks,
		allowedMarks,
		metaFields
	};
}

export function resolveRegistry(blocks: BlockRegistry | BlockDefinition[]): BlockRegistry {
	return Array.isArray(blocks) ? createBlockRegistry(blocks) : blocks;
}
