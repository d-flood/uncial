<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import { normalizeMeta } from '../core/meta.js';
	import type { ContentModel } from '../model.js';
	import Renderer from './Renderer.svelte';
	import { metaScope, setFieldHost } from '../runtime/fields.js';
	import { withBase } from '../shared/mediaValues.js';

	interface Props {
		model: ContentModel;
		document: JSONContent;
		/** The page path the model's Page template receives. */
		path?: string;
		/** Route data the model's Page template receives. */
		data?: Record<string, unknown>;
	}

	let { model, document, path = '', data = {} }: Props = $props();

	const stored = $derived(document.meta ?? {});
	const template = $derived(model.templateFor(stored));
	const fields = $derived(model.schemaFor(stored).metaFields);
	const meta = $derived(withBase(fields, normalizeMeta(stored, fields), model.base));

	setFieldHost({
		get base() {
			return model.base;
		},
		get registry() {
			return model.blocks;
		},
		get renditions() {
			return model.renditions;
		},
		page: metaScope({
			base: () => model.base,
			values: () => meta,
			specs: () => fields
		})
	});
</script>

{#snippet body()}
	<Renderer content={document} {model} {path} />
{/snippet}

{#if template}
	<template.component {meta} {path} {data} {body} />
{:else}
	{@render body()}
{/if}
