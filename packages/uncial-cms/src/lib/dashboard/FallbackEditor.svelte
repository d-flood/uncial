<script lang="ts">
	import { onMount } from 'svelte';
	import { mountEditorPage, type MountEditorPageOptions } from '../mount.js';
	import { cmsImageSource } from '../image-source.js';
	import { SignedOutError } from '../errors.js';
	import type { DashboardAction } from './types.js';

	let {
		options,
		basePath,
		staticDir,
		can,
		onsignedout
	}: {
		options: MountEditorPageOptions;
		basePath: string;
		staticDir?: string;
		can: (action: DashboardAction, subject?: unknown) => boolean;
		onsignedout: (reason: string) => void;
	} = $props();

	let target: HTMLDivElement;
	let handle: ReturnType<typeof mountEditorPage> | undefined;

	onMount(() => {
		const source = cmsImageSource(options.config, { base: basePath, staticDir });
		handle = mountEditorPage(target, {
			...options,
			imageSource: { ...source, upload: can('media-upload') ? source.upload : undefined },
			onerror: (error) => {
				if (error instanceof SignedOutError) onsignedout(error.message);
			}
		});
		return () => handle?.destroy();
	});

	export function isDirty(): boolean {
		return handle?.isDirty() ?? false;
	}
</script>

<div bind:this={target}></div>
