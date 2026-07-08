<script lang="ts">
	import { onMount } from 'svelte';

	interface TocItem {
		id: string;
		label: string;
	}

	let { items }: { items: TocItem[] } = $props();

	let activeId = $state('');
	// The viewport rendered onto the rail as a sliding window, in pixels relative
	// to the rail. The edges are interpolated through the actual link positions so
	// the window lines up with the list items — not with raw document heights.
	let windowTop = $state(0);
	let windowHeight = $state(0);

	let railEl: HTMLElement;
	const linkEls = new Map<string, HTMLAnchorElement>();

	function registerLink(node: HTMLAnchorElement, id: string) {
		linkEls.set(id, node);
		return {
			destroy() {
				linkEls.delete(id);
			}
		};
	}

	onMount(() => {
		const sections = items
			.map((item) => ({ id: item.id, el: document.getElementById(item.id) }))
			.filter((s): s is { id: string; el: HTMLElement } => s.el !== null);

		// Rail-relative vertical center of each link, paired with its section's
		// document offset. Rebuilt on resize since layout can change.
		let anchors: { docTop: number; railY: number }[] = [];

		function measure() {
			if (!railEl) return;
			const railRect = railEl.getBoundingClientRect();
			anchors = sections
				.map((s) => {
					const link = linkEls.get(s.id);
					if (!link) return null;
					const linkRect = link.getBoundingClientRect();
					return {
						docTop: s.el.offsetTop,
						railY: linkRect.top - railRect.top + linkRect.height / 2
					};
				})
				.filter((a): a is { docTop: number; railY: number } => a !== null);
		}

		// Map a document Y position onto the rail by interpolating between the two
		// nearest link anchors, so the window rides the list evenly section-to-section.
		function docToRail(y: number): number {
			if (anchors.length === 0) return 0;
			if (y <= anchors[0].docTop) return anchors[0].railY;
			const lastAnchor = anchors[anchors.length - 1];
			if (y >= lastAnchor.docTop) return lastAnchor.railY;
			for (let i = 0; i < anchors.length - 1; i++) {
				const a = anchors[i];
				const b = anchors[i + 1];
				if (y >= a.docTop && y <= b.docTop) {
					const frac = (y - a.docTop) / Math.max(1, b.docTop - a.docTop);
					return a.railY + frac * (b.railY - a.railY);
				}
			}
			return lastAnchor.railY;
		}

		function onScroll() {
			if (anchors.length === 0) return;
			const top = docToRail(window.scrollY);
			const bottom = docToRail(window.scrollY + window.innerHeight);
			windowTop = top;
			windowHeight = Math.max(6, bottom - top);

			// Active section: the last one whose top has scrolled past a line just
			// below the header, so the highlighted link matches the section in view.
			const readingLine = window.scrollY + 120;
			let current = sections[0]?.id ?? activeId;
			for (const s of sections) {
				if (s.el.offsetTop <= readingLine) {
					current = s.id;
				} else {
					break;
				}
			}
			// Snap to the last section once the page is scrolled to the bottom.
			if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) {
				current = sections[sections.length - 1]?.id ?? current;
			}
			activeId = current;
		}

		function onResize() {
			measure();
			onScroll();
		}

		measure();
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onResize, { passive: true });
		return () => {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
		};
	});
</script>

<nav class="docs-toc sticky top-6" aria-label="On this page">
	<p class="docs-toc__title">On this page</p>
	<div class="docs-toc__body">
		<!-- The rail: a full-height track with a sliding window that mirrors the
		     portion of the document currently in the viewport. -->
		<div class="docs-toc__rail" bind:this={railEl} aria-hidden="true">
			<div
				class="docs-toc__window"
				style:top="{windowTop}px"
				style:height="{windowHeight}px"
			></div>
		</div>
		<ul class="docs-toc__list">
			{#each items as item (item.id)}
				<li>
					<a
						href="#{item.id}"
						use:registerLink={item.id}
						class="docs-toc__link"
						class:is-active={activeId === item.id}
						aria-current={activeId === item.id ? 'true' : undefined}
					>
						{item.label}
					</a>
				</li>
			{/each}
		</ul>
	</div>
</nav>

<style>
	.docs-toc__title {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: color-mix(in oklab, var(--color-base-content) 55%, transparent);
		padding-left: 1.5rem;
		margin-bottom: 0.75rem;
	}

	.docs-toc__body {
		position: relative;
		display: flex;
	}

	.docs-toc__rail {
		position: absolute;
		left: 0;
		top: 0.15rem;
		bottom: 0.15rem;
		width: 2px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--color-base-content) 15%, transparent);
		overflow: visible;
	}

	.docs-toc__window {
		position: absolute;
		left: 50%;
		width: 4px;
		min-height: 2px;
		border-radius: 999px;
		background: var(--color-primary);
		transform: translateX(-50%);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 18%, transparent);
		transition:
			top 0.12s linear,
			height 0.12s linear;
	}

	.docs-toc__list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		width: 100%;
	}

	.docs-toc__link {
		display: block;
		padding: 0.3rem 0.5rem 0.3rem 1.5rem;
		font-size: 0.875rem;
		line-height: 1.3;
		border-radius: 0.375rem;
		color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
		text-decoration: none;
		transition:
			color 0.15s ease,
			background-color 0.15s ease;
	}

	.docs-toc__link:hover {
		color: var(--color-base-content);
		background: color-mix(in oklab, var(--color-base-content) 6%, transparent);
	}

	.docs-toc__link.is-active {
		color: var(--color-primary);
		font-weight: 600;
	}

	@media (prefers-reduced-motion: reduce) {
		.docs-toc__window {
			transition: none;
		}
	}
</style>
