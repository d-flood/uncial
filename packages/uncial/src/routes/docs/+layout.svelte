<script lang="ts">
	import GithubLogoIcon from 'phosphor-svelte/lib/GithubLogoIcon';
	import { resolve } from '$app/paths';
	import Logo from '../demo/Logo.svelte';
	import ThemeSwitcher from '$lib/ui/ThemeSwitcher.svelte';

	let { children } = $props();

	const repoUrl = 'https://github.com/d-flood/uncial';
</script>

<div class="min-h-dvh bg-base-100 pb-14">
	<header class="relative mx-auto max-w-368 px-6 pt-8 sm:px-10">
		<div class="border-b border-base-content/20 pb-5">
			<div class="flex items-center justify-center gap-4">
				<Logo size="8rem" class="text-primary" />
				<h1
					class="font-vellum-display text-center text-5xl font-black italic leading-none tracking-tight sm:text-6xl"
				>
					Uncial
				</h1>
			</div>
			<p
				class="font-vellum-mono mx-auto mt-5 max-w-3xl text-center text-[0.92rem] font-bold uppercase leading-normal tracking-[0.09em] text-base-content/78 sm:text-[1rem]"
			>
				The backend-agnostic CMS block editor <em class="text-primary not-italic">and</em> renderer.
				<br />
				Define custom blocks once as components, and reuse them seamlessly across your WYSIWYG editor
				and frontend.
			</p>
			<nav aria-label="Project links" class="mt-6 flex flex-wrap justify-center gap-3">
				<a href={repoUrl} target="_blank" rel="noreferrer" class="btn btn-primary btn-sm">
					<GithubLogoIcon size={16} weight="bold" />
					GitHub repo
				</a>
				<a href={resolve('/')} class="btn btn-outline btn-secondary btn-sm">Demo</a>
				<ThemeSwitcher />
			</nav>
		</div>
	</header>

	{@render children()}

	<footer class="mx-auto max-w-368 px-6 pt-6 sm:px-10">
		<div class="border-t border-base-content/20 pt-5">
			<nav aria-label="Project links" class="flex flex-wrap justify-center gap-3">
				<a href={repoUrl} target="_blank" rel="noreferrer" class="btn btn-primary btn-sm">
					<GithubLogoIcon size={16} weight="bold" />
					GitHub repo
				</a>
				<a href={resolve('/')} class="btn btn-outline btn-secondary btn-sm">Demo</a>
			</nav>
		</div>
	</footer>
</div>
