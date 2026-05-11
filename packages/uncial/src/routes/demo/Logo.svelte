<script lang="ts">
	interface Props {
		/** Size (any CSS length). Defaults to `2.5rem`. */
		size?: string;
		/** Extra classes — use Tailwind `text-*` utilities to set color. */
		class?: string;
		/** Accessible label; omit for decorative use. */
		label?: string;
	}

	let { size = '2.5rem', class: klass = '', label }: Props = $props();
</script>

<span
	class={['uncial-logo', klass]}
	style:--uncial-logo-size={size}
	role={label ? 'img' : 'presentation'}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
></span>

<style>
	.uncial-logo {
		display: inline-block;
		width: var(--uncial-logo-size);
		height: var(--uncial-logo-size);
		background-color: currentColor;
		-webkit-mask: url('/logo_black.svg') center / contain no-repeat;
		mask: url('/logo_black.svg') center / contain no-repeat;
		flex-shrink: 0;
	}
</style>
