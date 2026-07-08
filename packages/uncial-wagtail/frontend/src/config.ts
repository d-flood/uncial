import { createBlockRegistry } from 'uncial/core';
import type { BlockDefinition } from 'uncial/core';
import type { ToolbarFeature } from 'uncial/editor';

import { createWagtailImageBlock } from './imageBlock.js';
import { getUncialWagtailGlobal } from './uncialGlobal.js';
import type { UncialApiUrls } from './apiUrls.js';

/**
 * Normalized shape of the widget's `data-uncial-config` JSON, produced by
 * `UncialEditorConfig.as_dict()` on the Python side.
 */
export interface UncialWidgetConfig {
	/** Schema restriction: which block ids the document may contain. */
	allowedBlocks: string[];
	allowedMarks: string[];
	toolbarFeatures: string[];
	/** Keys into `window.uncialWagtail.toolbarExtensions`. */
	toolbarExtensions: string[];
	/** Keys (= block ids) into `window.uncialWagtail.customBlocks`. */
	customBlocks: string[];
	imageRenditions: string[];
	apiUrls: UncialApiUrls;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value !== '' ? value : undefined;
}

function normalizeApiUrls(value: unknown): UncialApiUrls {
	if (typeof value !== 'object' || value === null) return {};
	const record = value as Record<string, unknown>;
	const apiUrls: UncialApiUrls = {};
	const images = optionalString(record.images);
	const imagePreview = optionalString(record.imagePreview);
	const chooserModal = optionalString(record.chooserModal);
	if (images) apiUrls.images = images;
	if (imagePreview) apiUrls.imagePreview = imagePreview;
	if (chooserModal) apiUrls.chooserModal = chooserModal;
	return apiUrls;
}

export function normalizeConfig(config: unknown): UncialWidgetConfig {
	const record =
		typeof config === 'object' && config !== null ? (config as Record<string, unknown>) : {};
	return {
		allowedBlocks: stringArray(record.allowedBlocks),
		allowedMarks: stringArray(record.allowedMarks),
		toolbarFeatures: stringArray(record.toolbarFeatures),
		toolbarExtensions: stringArray(record.toolbarExtensions),
		customBlocks: stringArray(record.customBlocks),
		imageRenditions: stringArray(record.imageRenditions),
		apiUrls: normalizeApiUrls(record.apiUrls)
	};
}

/**
 * Build the block registry for a widget: the built-in `wagtail.image` block
 * (with the configured renditions) plus every configured custom block whose
 * factory was registered on `window.uncialWagtail.customBlocks`. Unknown keys
 * are skipped with a console warning. `allowedBlocks` does not gate the
 * registry — it restricts the schema (see `createSchema`).
 */
export function createBlocks(config: UncialWidgetConfig) {
	const blocks: BlockDefinition[] = [
		createWagtailImageBlock(
			config.imageRenditions.length ? { renditions: config.imageRenditions } : {}
		)
	];
	const factories = getUncialWagtailGlobal()?.customBlocks ?? {};

	for (const key of config.customBlocks) {
		const factory = factories[key];
		if (typeof factory !== 'function') {
			console.warn(
				`[uncial-wagtail] Unknown custom block "${key}"; register a factory on ` +
					'window.uncialWagtail.customBlocks before the admin bundle initializes.'
			);
			continue;
		}
		const block = factory();
		if (blocks.some((existing) => existing.id === block.id)) {
			console.warn(`[uncial-wagtail] Duplicate custom block id "${block.id}" skipped.`);
			continue;
		}
		blocks.push(block);
	}

	return createBlockRegistry(blocks);
}

/**
 * Resolve `toolbarExtensions` config keys against the
 * `window.uncialWagtail.toolbarExtensions` registry. Unknown keys are skipped
 * with a console warning.
 */
export function resolveToolbarExtensions(keys: string[]): ToolbarFeature[] {
	const registry = getUncialWagtailGlobal()?.toolbarExtensions ?? {};
	const features: ToolbarFeature[] = [];
	for (const key of keys) {
		const feature = registry[key];
		if (!feature) {
			console.warn(
				`[uncial-wagtail] Unknown toolbar extension "${key}"; register it on ` +
					'window.uncialWagtail.toolbarExtensions before the admin bundle initializes.'
			);
			continue;
		}
		features.push(feature);
	}
	return features;
}
