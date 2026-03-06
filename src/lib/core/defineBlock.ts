import type {
	AttributeConfig,
	AttributeSpec,
	BlockAttributes,
	BlockConfig,
	BlockComponents,
	BlockDefinition,
	NormalizedAttributes
} from './types.js';

function isAttributeSpec<T>(value: AttributeConfig<T>): value is AttributeSpec<T> {
	return typeof value === 'object' && value !== null && 'default' in value;
}

function normalizeAttribute<T>(value: AttributeConfig<T>): AttributeSpec<T> {
	if (isAttributeSpec(value)) {
		return value;
	}

	return {
		default: value
	};
}

function normalizeAttributes<Attrs extends BlockAttributes>(
	attributes: BlockConfig<Attrs>['attributes']
): NormalizedAttributes<Attrs> {
	const normalized = {} as NormalizedAttributes<Attrs>;

	for (const key of Object.keys(attributes) as (keyof Attrs)[]) {
		const value = attributes[key] as AttributeConfig<Attrs[typeof key]>;
		normalized[key] = normalizeAttribute(value) as AttributeSpec<Attrs[typeof key]>;
	}

	return normalized;
}

function validateConfig<Attrs extends BlockAttributes>(config: BlockConfig<Attrs>): void {
	if (!config.id.trim()) {
		throw new Error('Block id must be a non-empty string');
	}

	if (!config.label.trim()) {
		throw new Error(`Block "${config.id}" must have a non-empty label`);
	}

	for (const [name, attr] of Object.entries(config.attributes)) {
		const normalized = normalizeAttribute(attr);
		if (!('default' in normalized)) {
			throw new Error(`Attribute "${name}" in block "${config.id}" must define a default value`);
		}
	}
}

function normalizeComponents<Attrs extends BlockAttributes>(
	config: BlockConfig<Attrs>
): BlockComponents {
	const shared = config.component;
	const editor = config.components?.editor ?? shared ?? config.components?.render;
	const render = config.components?.render ?? shared ?? config.components?.editor;

	if (!editor || !render) {
		throw new Error(
			`Block "${config.id}" must provide either "component" or both "components.editor" and "components.render"`
		);
	}

	return { editor, render };
}

export function defineBlock<Attrs extends BlockAttributes>(
	config: BlockConfig<Attrs>
): BlockDefinition<Attrs> {
	validateConfig(config);

	return Object.freeze({
		id: config.id,
		label: config.label,
		description: config.description,
		icon: config.icon,
		attributes: normalizeAttributes(config.attributes),
		components: normalizeComponents(config),
		behaviors: {
			inline: config.behaviors?.inline ?? false,
			draggable: config.behaviors?.draggable ?? true,
			selectable: config.behaviors?.selectable ?? true
		},
		html: config.html
	});
}
