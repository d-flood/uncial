import type {
	AttributeConfig,
	AttributeOption,
	AttributeSpec,
	BlockAttributes,
	BlockContentDefinition,
	BlockComponents,
	BlockDefinition,
	NormalizedAttributes,
	RuntimeBlockConfig
} from './types.js';
import type { BlockRuntimePlugin } from './runtime.js';
import { isAttributeOption } from '../shared/guards.js';
import { isAttributeSpecConfig, toAttributeSpec } from './attributes.js';

function optionValues<T>(options: ReadonlyArray<T | AttributeOption<T>>): T[] {
	return options.map((option) => (isAttributeOption<T>(option) ? option.value : (option as T)));
}

function normalizeAttribute<T>(value: AttributeConfig<T>): AttributeSpec<T> {
	const spec = toAttributeSpec(value);

	if (spec.options && spec.options.length > 0 && !spec.validate) {
		const allowed = optionValues(spec.options);
		spec.validate = (candidate: unknown): candidate is T => allowed.includes(candidate as T);
	}

	return spec;
}

function normalizeAttributes<Attrs extends BlockAttributes>(
	attributes: RuntimeBlockConfig<Attrs, unknown>['attributes']
): NormalizedAttributes<Attrs> {
	const normalized = {} as NormalizedAttributes<Attrs>;

	for (const key of Object.keys(attributes) as (keyof Attrs)[]) {
		const value = attributes[key] as AttributeConfig<Attrs[typeof key]>;
		normalized[key] = normalizeAttribute(value) as AttributeSpec<Attrs[typeof key]>;
	}

	return normalized;
}

function validateConfig<Attrs extends BlockAttributes, Component>(
	config: RuntimeBlockConfig<Attrs, Component>
): void {
	if (!config.id.trim()) {
		throw new Error('Block id must be a non-empty string');
	}

	if (!config.label.trim()) {
		throw new Error(`Block "${config.id}" must have a non-empty label`);
	}

	for (const [name, attr] of Object.entries(config.attributes)) {
		// A plain object that carries config keys but no `default` is a config
		// object that forgot its default (previously misparsed as an object-valued
		// default, making this check unreachable). Objects with no config keys are
		// valid shorthand object defaults and pass through.
		if (isAttributeSpecConfig(attr) && !('default' in attr)) {
			throw new Error(
				`Attribute "${name}" in block "${config.id}" is a configuration object but does not ` +
					`define a "default" value. If you meant an object as the default value, wrap it ` +
					`explicitly as { default: { ... } }.`
			);
		}

		// A list with no item shape has nothing to render a field from, and would
		// silently fall back to raw JSON — the thing `list` exists to replace.
		if (isAttributeSpecConfig(attr) && attr.list && !attr.list.fields && attr.list.value === undefined) {
			throw new Error(
				`Attribute "${name}" in block "${config.id}" declares "list" but neither ` +
					`"list.fields" nor "list.value", so the editor has no item shape to render.`
			);
		}
	}

	if (config.content && config.behaviors?.inline) {
		throw new Error(
			`Block "${config.id}" cannot be inline when content.kind is "${config.content.kind}"`
		);
	}
}

function normalizeComponents<Attrs extends BlockAttributes, Component>(
	runtime: BlockRuntimePlugin<Component>,
	config: RuntimeBlockConfig<Attrs, Component>
): BlockComponents {
	const shared = config.component;
	const render = config.components?.render ?? shared ?? config.components?.editor;
	const editor = config.readOnly ? render : config.components?.editor ?? shared ?? render;

	if (!editor || !render) {
		throw new Error(
			`Block "${config.id}" must provide either "component" or both "components.editor" and "components.render"`
		);
	}

	return { editor: runtime.defineComponent(editor), render: runtime.defineComponent(render) };
}

function normalizeContent(
	content: false | BlockContentDefinition | undefined
): BlockContentDefinition | undefined {
	if (!content) {
		return undefined;
	}

	// An empty `allowedBlocks` names no block and cannot be meant as "admits
	// nothing", so it normalizes to unconstrained.
	const allowedBlocks = content.allowedBlocks?.length
		? Object.freeze([...content.allowedBlocks])
		: undefined;

	return {
		kind: content.kind,
		...(allowedBlocks ? { allowedBlocks } : {})
	};
}

export function defineRuntimeBlock<Attrs extends BlockAttributes, Component>(
	runtime: BlockRuntimePlugin<Component>,
	config: RuntimeBlockConfig<Attrs, Component>
): BlockDefinition<Attrs> {
	validateConfig(config);

	return Object.freeze({
		id: config.id,
		runtime: runtime.id,
		label: config.label,
		description: config.description,
		icon: config.icon,
		readOnly: config.readOnly ?? false,
		attributes: normalizeAttributes(config.attributes),
		components: normalizeComponents(runtime, config),
		behaviors: {
			inline: config.behaviors?.inline ?? false,
			draggable: config.behaviors?.draggable ?? true,
			selectable: config.behaviors?.selectable ?? true
		},
		content: normalizeContent(config.content),
		html: config.html
	});
}
