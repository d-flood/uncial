<script lang="ts">
	import 'uncial/styles';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<div class="site">
	<header class="site-header">
		<nav>
			<a href={resolve('/')}>uncial-cms demo</a>
			<a href={resolve('/about')}>About</a>
			<a href={resolve('/uncial')}>Site index</a>
			<a href="https://github.com/d-flood/uncial">GitHub</a>
		</nav>
	</header>
	<main class="site-main">
		{@render children()}
	</main>
</div>

<style>
	.site {
		max-width: 48rem;
		margin: 0 auto;
		padding: 0 1rem 4rem;
		font-family: system-ui, sans-serif;
	}
	.site-header {
		padding: 1rem 0;
		border-bottom: 1px solid #d4d4d8;
		margin-bottom: 2rem;
	}
	.site-header nav {
		display: flex;
		gap: 1.25rem;
	}
	.site-header a {
		color: inherit;
		text-decoration: none;
		font-weight: 500;
	}
	.site-header a:hover {
		text-decoration: underline;
	}
</style>
