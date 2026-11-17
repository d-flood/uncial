<script module lang="ts">
	import { DEV } from 'esm-env';

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a log, not state
	const warned = new Set<string>();
	function warnUnknownCrop(name: string): void {
		if (!DEV || warned.has(name)) return;
		warned.add(name);
		console.warn(`uncial: no rendition crop named "${name}"`);
	}
</script>

<script lang="ts">
	import type { HTMLImgAttributes } from 'svelte/elements';
	import type { FocalPoint } from '../core/types.js';
	import { getFieldHost, useField } from '../runtime/fields.js';
	import { resolveImageSrc, stripBase } from './resolveImageSrc.js';

	type Props = Omit<HTMLImgAttributes, 'src' | 'srcset'> & {
		name: string;
		/** A crop the attribute's `renditions` declares. */
		crop?: string;
	};

	let { name, alt, crop, ...rest }: Props = $props();

	const host = getFieldHost();
	const field = useField(() => name);
	const scope = $derived(field.scope);
	const Editing = $derived(scope && field.editors?.image);
	const value = $derived(scope?.value(name));
	const focal = $derived((value as { focal?: FocalPoint } | null | undefined)?.focal);
	const src = $derived.by(() => {
		if (typeof value === 'string') return value;
		const nested = (value as { src?: unknown } | null | undefined)?.src;
		return typeof nested === 'string' ? nested : '';
	});
	const rendered = $derived.by((): { src: string; srcset?: string; cropped?: boolean } => {
		const spec = scope?.spec(name)?.renditions;
		if (!scope || !src || !spec || !host?.renditions) return { src };
		if (crop && !spec.crops?.[crop]) {
			warnUnknownCrop(crop);
			return { src };
		}
		const base = scope.base;
		const stored = stripBase(src, base);
		const result = host.renditions(
			typeof value === 'string' ? stored : { ...(value as object), src: stored },
			spec,
			crop
		);
		if (!result) return { src };
		return {
			src: resolveImageSrc(result.src, base),
			srcset: result.srcset
				?.split(/,\s+/)
				.map((candidate) => {
					const [url = '', ...descriptor] = candidate.trim().split(/\s+/);
					return [resolveImageSrc(url, base), ...descriptor].join(' ');
				})
				.join(', '),
			cropped: Boolean(crop)
		};
	});
	const altText = $derived(
		alt ?? (name !== 'alt' && scope?.has('alt') ? String(scope.value('alt') ?? '') : '')
	);
</script>

{#if scope && Editing}
	<Editing {...rest} {scope} {name} alt={alt ?? undefined} />
{:else if scope && src}
	<img
		{...rest}
		src={rendered.src}
		srcset={rendered.srcset}
		alt={altText}
		style:object-position={focal && !rendered.cropped
			? `${focal.x * 100}% ${focal.y * 100}%`
			: undefined}
	/>
{/if}
