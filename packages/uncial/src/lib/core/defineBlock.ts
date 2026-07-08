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
import { isAttributeOption, isPlainObject } from '../shared/guards.js';

// The keys that mark an object as an AttributeSpec *configuration* rather than a
// shorthand object default. An object carrying any of these is treated as a
// config object; to use an object literal AS the default value, wrap it
// explicitly: `{ default: { ... } }`.
const CONFIG_KEYS = [
	'default',
	'required',
	'validate',
	'parse',
	'serialize',
	'input',
	'placeholder',
	'options',
	'richText'
] as const;

/**
 * Distinguishes a spec/config object (`{ default, input, ... }`) from a bare
 * object used directly as the default value. Any plain object carrying a known
 * config key is a config; everything else is a shorthand default. This makes a
 * config object that forgot its `default` detectable (see {@link validateConfig})
 * instead of being silently misparsed as an object-valued default.
 */
function looksLikeConfig<T>(value: AttributeConfig<T>): value is AttributeSpec<T> {
	return isPlainObject(value) && CONFIG_KEYS.some((key) => key in value);
}

function optionValues<T>(options: ReadonlyArray<T | AttributeOption<T>>): T[] {
	return options.map((option) => (isAttributeOption<T>(option) ? option.value : (option as T)));
}

function normalizeAttribute<T>(value: AttributeConfig<T>): AttributeSpec<T> {
	const spec: AttributeSpec<T> = looksLikeConfig(value)
		? { ...(value as AttributeSpec<T>) }
		: ({ default: value } as AttributeSpec<T>);

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
		if (looksLikeConfig(attr) && !('default' in attr)) {
			throw new Error(
				`Attribute "${name}" in block "${config.id}" is a configuration object but does not ` +
					`define a "default" value. If you meant an object as the default value, wrap it ` +
					`explicitly as { default: { ... } }.`
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
	const editor = config.components?.editor ?? shared ?? config.components?.render;
	const render = config.components?.render ?? shared ?? config.components?.editor;

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

	return {
		kind: content.kind
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
