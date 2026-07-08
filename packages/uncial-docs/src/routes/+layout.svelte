<script lang="ts">
	import '../app.css';
	import GithubLogoIcon from 'phosphor-svelte/lib/GithubLogoIcon';
	import { resolve } from '$app/paths';
	import Logo from '$lib/ui/Logo.svelte';
	import ThemeSwitcher from '$lib/ui/ThemeSwitcher.svelte';

	let { children } = $props();

	const repoUrl = 'https://github.com/d-flood/uncial';
</script>

<div class="min-h-dvh bg-base-100 pb-14">
	<header class="relative mx-auto max-w-368 px-6 pt-8 sm:px-10">
		<div class="border-b border-base-content/20 pb-5">
			<div class="flex items-center justify-center gap-4">
				<a href={resolve('/getting-started')} class="flex items-center gap-4 no-underline">
					<Logo size="6rem" class="text-primary" />
					<h1
						class="font-vellum-display text-center text-4xl font-black italic leading-none tracking-tight sm:text-5xl"
					>
						Uncial Docs
					</h1>
				</a>
			</div>
			<nav aria-label="Project links" class="mt-6 flex flex-wrap justify-center gap-3">
				<a href={repoUrl} target="_blank" rel="noreferrer" class="btn btn-primary btn-sm">
					<GithubLogoIcon size={16} weight="bold" />
					GitHub repo
				</a>
				<a href={resolve('/uncial')} class="btn btn-outline btn-secondary btn-sm">Site index</a>
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
				<a href={resolve('/uncial')} class="btn btn-outline btn-secondary btn-sm">Site index</a>
			</nav>
		</div>
	</footer>
</div>
