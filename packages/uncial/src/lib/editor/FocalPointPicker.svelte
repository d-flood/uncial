<script lang="ts">
	import type { FocalPoint } from '../core/types.js';

	interface Props {
		src: string;
		focal?: FocalPoint;
		onChange: (focal: FocalPoint | undefined) => void;
	}

	let { src, focal, onChange }: Props = $props();

	let image = $state<HTMLImageElement>();
	const STEP = 0.05;

	const round = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
	const percent = (value: number) => `${Math.round(value * 100)}%`;

	function place(event: MouseEvent): void {
		// A keyboard-activated click carries no pointer position.
		if (event.detail === 0 || !image) return;
		const rect = image.getBoundingClientRect();
		onChange({
			x: round((event.clientX - rect.left) / rect.width),
			y: round((event.clientY - rect.top) / rect.height)
		});
	}

	const MOVES: Record<string, [number, number]> = {
		ArrowLeft: [-STEP, 0],
		ArrowRight: [STEP, 0],
		ArrowUp: [0, -STEP],
		ArrowDown: [0, STEP]
	};

	function nudge(event: KeyboardEvent): void {
		const move = MOVES[event.key];
		if (!move) return;
		event.preventDefault();
		const { x, y } = focal ?? { x: 0.5, y: 0.5 };
		onChange({ x: round(x + move[0]), y: round(y + move[1]) });
	}
</script>

<div class="uncial-focal-point">
	<button
		type="button"
		class="uncial-focal-point__frame"
		aria-label="Focal point: click the image, or use the arrow keys"
		onclick={place}
		onkeydown={nudge}
	>
		<img bind:this={image} {src} alt="" draggable="false" />
		{#if focal}
			<span
				class="uncial-focal-point__marker"
				style:left={percent(focal.x)}
				style:top={percent(focal.y)}
				aria-hidden="true"
			></span>
		{/if}
	</button>
	<div class="uncial-focal-point__status">
		<span class="uncial-help-text" role="status">
			{focal
				? `Focal point ${percent(focal.x)} across, ${percent(focal.y)} down`
				: 'Click the image to set its focal point.'}
		</span>
		{#if focal}
			<button
				type="button"
				class="uncial-btn uncial-btn--ghost uncial-btn--xs"
				onclick={() => onChange(undefined)}
			>
				Reset
			</button>
		{/if}
	</div>
</div>
