import type {
	BlockDefinition,
	BlockMetadata,
	BlockRegistry,
	ContentSchema,
	CreateSchemaOptions
} from './types.js';

const DEFAULT_MARKS = ['bold', 'italic', 'strike', 'code', 'link'] as const;

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
	const allowedBlocks = options.allowedBlocks
		? new Set(options.allowedBlocks.filter((id: string) => registry.has(id)))
		: new Set(registry.blocks.map((block: BlockDefinition) => block.id));

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
