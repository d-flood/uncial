<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import DotsSixVerticalIcon from 'phosphor-svelte/lib/DotsSixVerticalIcon';

	interface Props {
		component: Component<Record<string, unknown>>;
		attrs?: Record<string, unknown>;
		content?: unknown[];
		children?: Snippet;
		blockId: string;
		label: string;
		draggable?: boolean;
		onActivate?: () => void;
	}

	interface PointerStart {
		x: number;
		y: number;
		pointerId: number;
	}

	let {
		component: BlockComponent,
		attrs = {},
		content = [],
		children,
		blockId,
		label,
		draggable = true,
		onActivate
	}: Props = $props();

	let pointerStart: PointerStart | null = null;

	const componentProps = $derived({
		...attrs,
		content,
		children
	});

	function handleActivationPointerDown(event: PointerEvent): void {
		pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
	}

	function handleActivationPointerUp(event: PointerEvent): void {
		if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;
		const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
		pointerStart = null;
		if (distance <= 4) {
			onActivate?.();
		}
	}
</script>

<div class="uncial-nodeview-frame" contenteditable={children ? undefined : 'false'}>
	<div class="uncial-nodeview-gutter" contenteditable="false">
		{#if draggable}
			<button
				type="button"
				class="uncial-gutter-drag"
				data-drag-handle
				draggable="true"
				style="cursor: grab;"
				aria-label={`Drag ${label || blockId} block`}
				onpointerdown={handleActivationPointerDown}
				onpointerup={handleActivationPointerUp}
			>
				<DotsSixVerticalIcon size={14} weight="bold" aria-hidden="true" />
			</button>
		{/if}
		<button
			type="button"
			class="uncial-gutter-label"
			onpointerdown={handleActivationPointerDown}
			onpointerup={handleActivationPointerUp}>{label}</button
		>
	</div><div class="uncial-nodeview-body">
		<BlockComponent {...componentProps} />
	</div>
</div>
