<script lang="ts">
	import { onMount } from 'svelte';
	import { mountEditor, type MountEditorOptions } from '../mount.js';
	import { SignedOutError } from '../errors.js';
	import type { DashboardAction } from './types.js';

	let {
		options,
		can,
		onsignedout
	}: {
		options: MountEditorOptions;
		can: (action: DashboardAction, subject?: unknown) => boolean;
		onsignedout: (reason: string) => void;
	} = $props();

	let target: HTMLDivElement;
	let handle: ReturnType<typeof mountEditor> | undefined;

	onMount(() => {
		const images = options.site.media;
		const files = options.site.files;
		const upload = can('media-upload');
		handle = mountEditor(target, {
			...options,
			imageSource: { ...images, upload: upload ? images.upload : undefined },
			fileSource: { ...files, upload: upload ? files.upload : undefined },
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
