import type {
	AttributeConfig,
	AttributeOption,
	AttributeSpec,
	BlockAttributes,
	BlockConfig,
	BlockContentDefinition,
	BlockComponents,
	BlockDefinition,
	NormalizedAttributes
} from './types.js';

function isAttributeSpec<T>(value: AttributeConfig<T>): value is AttributeSpec<T> {
	return typeof value === 'object' && value !== null && 'default' in value;
}

function isAttributeOption<T>(value: unknown): value is AttributeOption<T> {
	return typeof value === 'object' && value !== null && !Array.isArray(value) && 'value' in value;
}

function optionValues<T>(options: ReadonlyArray<T | AttributeOption<T>>): T[] {
	return options.map((option) => (isAttributeOption<T>(option) ? option.value : (option as T)));
}

function normalizeAttribute<T>(value: AttributeConfig<T>): AttributeSpec<T> {
	const spec: AttributeSpec<T> = isAttributeSpec(value) ? { ...value } : { default: value };

	if (spec.options && spec.options.length > 0 && !spec.validate) {
		const allowed = optionValues(spec.options);
		spec.validate = (candidate: unknown): candidate is T => allowed.includes(candidate as T);
	}

	return spec;
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

	if (config.content && config.behaviors?.inline) {
		throw new Error(
			`Block "${config.id}" cannot be inline when content.kind is "${config.content.kind}"`
		);
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

function normalizeContent(
	content: false | BlockContentDefinition | undefined
): BlockContentDefinition | undefined {
	if (!content) {
		return undefined;
	}

	return {
		kind: content.kind
	};
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
		content: normalizeContent(config.content),
		html: config.html
	});
}
