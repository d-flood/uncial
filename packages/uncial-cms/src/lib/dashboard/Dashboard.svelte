<svelte:options css="injected" />

<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { defaultSessionProvider, forgeAdapter } from '../editor-session.js';
	import { SignedOutError } from '../errors.js';
	import { globalTitle } from '../globals.js';
	import { defaultMapPathToSource } from '../paths/index.js';
	import { UNCIAL_CMS_RUNTIME_SENTINEL } from '../sentinel.js';
	import { clearCachedSession } from '../session.js';
	import type {
		ForgeAdapter,
		ForgeSession,
		SessionProvider,
		UncialCmsSiteConfig
	} from '../types.js';
	import FallbackEditor from './FallbackEditor.svelte';
	import GlobalForm from './GlobalForm.svelte';
	import GlobalsList from './GlobalsList.svelte';
	import MediaSection from './MediaSection.svelte';
	import PagesSection from './PagesSection.svelte';
	import {
		hashForRoute,
		routeFromHash,
		type DashboardRoute,
		type DashboardSection,
		type PagesQuery
	} from './routes.js';
	import type { DashboardProps } from './types.js';

	let {
		config,
		blocks,
		schema,
		globals,
		editorHref,
		can = () => true,
		appSections = [],
		signOutHref,
		basePath = '',
		theme = 'system',
		sessionProvider,
		mapPathToSource,
		mapSourceToPath,
		editorStylesheets,
		staticDir,
		sections = ['pages', 'media', 'globals']
	}: DashboardProps = $props();

	const uid = $props.id();

	const LABELS: Record<DashboardSection, string> = {
		pages: 'Pages',
		media: 'Media',
		globals: 'Globals'
	};

	const site = $derived<UncialCmsSiteConfig | undefined>(
		config && ('forge' in config ? config : config.config)
	);
	const globalSchemas = $derived(globals ?? (config && 'globals' in config ? config.globals : {}));
	const branchLabel = $derived(
		site?.forge === 'github'
			? site.branch
			: site?.forge === 'server'
				? 'the server'
				: 'the local checkout'
	);
	const locationLabel = $derived(
		site?.forge === 'github' ? `${site.repo}@${site.branch}` : site ? branchLabel : ''
	);
	const sourceFor = $derived.by(() => {
		if (mapPathToSource) return mapPathToSource;
		if (site?.forge === 'server') return (path: string) => (path === '' ? '/' : `/${path}/`);
		const contentDir = site?.contentDir ?? '';
		return (path: string) => defaultMapPathToSource(path, contentDir);
	});
	const schemaFor = (pagePath: string) =>
		typeof schema === 'function' ? (schema as (path: string) => unknown)(pagePath) : schema;

	let connection = $state.raw<{ adapter: ForgeAdapter; session: ForgeSession }>();
	let signedOut = $state<string>();
	const user = $derived(connection?.session.user);

	let route = $state<DashboardRoute>({ section: 'pages' });
	let pagesQuery = $state<PagesQuery>({});
	const pagesHref = $derived(hashForRoute({ section: 'pages', query: pagesQuery }));
	const openGlobal = $derived(
		route.section === 'globals' && route.name && Object.hasOwn(globalSchemas, route.name)
			? { name: route.name, schema: globalSchemas[route.name]! }
			: undefined
	);
	let hash = '';
	let heading = $state<HTMLElement>();
	let editor = $state<{ isDirty(): boolean }>();
	let menuOpen = $state(false);
	let menuButton = $state<HTMLButtonElement>();

	const navItems = $derived([
		...sections.map((id) => ({
			id,
			label: LABELS[id],
			href: id === 'pages' ? pagesHref : `#/${id}`
		})),
		...appSections.map((app) => ({
			id: `app/${app.id}`,
			label: app.label,
			href: app.href ?? hashForRoute({ section: 'app', id: app.id })
		}))
	]);
	const showNav = $derived(navItems.length > 1 && signedOut === undefined);
	const activeId = $derived(
		route.section === 'edit' ? 'pages' : route.section === 'app' ? `app/${route.id}` : route.section
	);
	const title = $derived(
		signedOut !== undefined
			? 'Signed out'
			: route.section === 'edit'
				? route.pagePath === ''
					? 'Editing site root'
					: `Editing /${route.pagePath}/`
				: openGlobal
					? (globalTitle(openGlobal.schema) ?? openGlobal.name)
					: (navItems.find((item) => item.id === activeId)?.label ?? LABELS.pages)
	);

	const reason = (error: unknown) =>
		error instanceof Error ? error.message : 'Failed to sign in.';
	const provideSession: SessionProvider = async (current) => {
		try {
			const session = await (sessionProvider ?? defaultSessionProvider(current))(current);
			if (current === site && connection) connection = { ...connection, session };
			return session;
		} catch (error) {
			throw new SignedOutError(reason(error));
		}
	};

	async function signIn(current: UncialCmsSiteConfig) {
		const adapter = forgeAdapter(current);
		try {
			const session = await adapter.authenticate(current, provideSession);
			if (current !== site) return;
			connection = { adapter, session };
			signedOut = undefined;
		} catch (error) {
			if (current !== site) return;
			signedOut = reason(error);
		}
	}

	async function retrySignIn() {
		if (!site) return;
		await signIn(site);
		await tick();
		if (connection) heading?.focus();
	}

	async function endSession(why: string) {
		connection = undefined;
		signedOut = why;
		menuOpen = false;
		await tick();
		heading?.focus();
	}

	function signOut() {
		if (site?.forge === 'github') clearCachedSession(site.repo);
		void endSession('You signed out.');
	}

	$effect(() => {
		const current = site;
		if (current) untrack(() => void signIn(current));
	});

	function resolve(next: string): DashboardRoute {
		const parsed = routeFromHash(next);
		if (parsed.section === 'edit') return parsed;
		if (parsed.section === 'app') {
			return appSections.some((app) => app.id === parsed.id && !app.href)
				? parsed
				: { section: 'pages' };
		}
		if (!sections.includes(parsed.section)) return { section: 'pages' };
		if (parsed.section === 'globals' && parsed.name && !Object.hasOwn(globalSchemas, parsed.name)) {
			return { section: 'globals' };
		}
		return parsed;
	}

	function apply(next: string) {
		const resolved = resolve(next);
		const canonical = hashForRoute(resolved);
		if (next !== '' && next !== canonical) history.replaceState(history.state, '', canonical);
		hash = next === '' ? '' : canonical;
		route = resolved;
		if (resolved.section === 'pages') pagesQuery = resolved.query ?? {};
	}

	// A query change keeps focus where it is, so it replaces the hash without a hashchange.
	function setPagesQuery(query: PagesQuery) {
		pagesQuery = query;
		route = { section: 'pages', query };
		hash = hashForRoute(route);
		history.replaceState(history.state, '', hash);
	}

	function onHashChange() {
		if (location.hash === hash) return;
		if (route.section === 'edit' && editor?.isDirty() && !confirm('Discard unsaved changes?')) {
			history.replaceState(history.state, '', hash);
			return;
		}
		apply(location.hash);
		menuOpen = false;
		void tick().then(() => heading?.focus());
	}

	function onBeforeUnload(event: BeforeUnloadEvent) {
		if (route.section === 'edit' && editor?.isDirty()) event.preventDefault();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !menuOpen) return;
		menuOpen = false;
		menuButton?.focus();
	}

	onMount(() => {
		apply(location.hash);
	});
</script>

<svelte:window onhashchange={onHashChange} onbeforeunload={onBeforeUnload} onkeydown={onKeydown} />

<div
	class="dashboard uncial-dashboard"
	data-theme={theme}
	data-uncial-cms-runtime={UNCIAL_CMS_RUNTIME_SENTINEL}
>
	<div class="topbar">
		{#if showNav}
			<button
				bind:this={menuButton}
				type="button"
				class="btn menu-button"
				aria-expanded={menuOpen}
				aria-controls="{uid}-nav"
				onclick={() => (menuOpen = !menuOpen)}
			>
				<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
					<path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" />
				</svg>
				Menu
			</button>
		{/if}
		<div class="identity">
			<p class="name">Dashboard</p>
			{#if locationLabel}<p class="location">{locationLabel}</p>{/if}
		</div>
		<div class="session">
			{#if signedOut === undefined}
				<p class="status" role="status">
					{#if user}Signed in as <strong>{user.name || user.login}</strong>{:else}Signing in…{/if}
				</p>
			{/if}
			{#if user && site?.forge === 'github'}
				<button type="button" class="btn" onclick={signOut}>Sign out</button>
			{:else if user && site?.forge === 'server' && signOutHref}
				<a class="btn" href={signOutHref}>Sign out</a>
			{/if}
		</div>
	</div>

	<div class="body">
		{#if showNav}
			<nav id="{uid}-nav" class="nav" class:open={menuOpen} aria-label="Dashboard">
				<ul>
					{#each navItems as item (item.id)}
						<li>
							<a
								href={item.href}
								aria-current={activeId === item.id ? 'page' : undefined}
								onclick={() => (menuOpen = false)}>{item.label}</a
							>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}

		<div class="content">
			{#if route.section === 'edit' && signedOut === undefined}
				<a class="back" href={pagesHref}><span aria-hidden="true">←</span> Back to pages</a>
			{:else if openGlobal && signedOut === undefined}
				<a class="back" href="#/globals"><span aria-hidden="true">←</span> Back to globals</a>
			{/if}
			<h1 bind:this={heading} tabindex="-1">{title}</h1>

			{#if signedOut !== undefined}
				<p class="reason" role="status">{signedOut}</p>
				<!-- The first attempt runs outside a click, where browsers block the sign-in popup. -->
				<button type="button" class="btn btn-primary" onclick={retrySignIn}>Sign in</button>
			{:else if route.section === 'edit'}
				{#if connection && site}
					{#if can('save-draft', route.pagePath)}
						{#key route.pagePath}
							<FallbackEditor
								bind:this={editor}
								options={{
									config: site,
									sourcePath: sourceFor(route.pagePath),
									pagePath: route.pagePath,
									blocks,
									schema: schemaFor(route.pagePath),
									sessionProvider: provideSession,
									editorStylesheets
								}}
								{basePath}
								{staticDir}
								{can}
								onsignedout={endSession}
							/>
						{/key}
					{:else}
						<p>You don’t have permission to edit this page.</p>
					{/if}
				{/if}
			{:else if route.section === 'app'}
				{#if connection}
					<svelte:element this={'slot'} name={route.id} />
				{/if}
			{:else if route.section === 'pages'}
				{#if connection && site}
					<PagesSection
						config={site}
						adapter={connection.adapter}
						session={connection.session}
						{blocks}
						{schemaFor}
						{sourceFor}
						{mapSourceToPath}
						{basePath}
						{editorHref}
						{branchLabel}
						{can}
						query={(route.section === 'pages' && route.query) || {}}
						onquery={setPagesQuery}
						onfocusheading={() => heading?.focus()}
						onsignedout={endSession}
					/>
				{/if}
			{:else if route.section === 'media'}
				{#if connection && site}
					<MediaSection
						config={site}
						adapter={connection.adapter}
						session={connection.session}
						{staticDir}
						{basePath}
						{mapSourceToPath}
						{branchLabel}
						{can}
						onsignedout={endSession}
					/>
				{/if}
			{:else if route.section === 'globals'}
				{#if connection && site}
					{#if openGlobal}
						{#key openGlobal}
							<GlobalForm
								config={site}
								adapter={connection.adapter}
								session={connection.session}
								name={openGlobal.name}
								schema={openGlobal.schema}
								{branchLabel}
								{can}
								onfocusheading={() => heading?.focus()}
								onsignedout={endSession}
							/>
						{/key}
					{:else}
						<GlobalsList globals={globalSchemas} />
					{/if}
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	@layer uncial-tokens {
		:global(:host),
		:global(:root) .dashboard {
			--uncial-color-bg: light-dark(oklch(99% 0.006 85), oklch(18% 0.015 60));
			--uncial-color-surface: light-dark(oklch(99% 0.006 85), oklch(18% 0.015 60));
			--uncial-color-surface-elevated: light-dark(oklch(96% 0.022 85), oklch(22% 0.02 60));
			--uncial-color-border: light-dark(oklch(91% 0.032 82), oklch(27% 0.025 60));
			--uncial-color-border-strong: color-mix(
				in srgb,
				var(--uncial-color-text) 22%,
				var(--uncial-color-border)
			);
			--uncial-color-text: light-dark(oklch(22% 0.04 45), oklch(92% 0.015 85));
			--uncial-color-primary: light-dark(oklch(46% 0.14 260), oklch(72% 0.13 260));
			--uncial-color-primary-contrast: light-dark(oklch(98% 0.015 85), oklch(16% 0.03 260));
			--uncial-color-danger: light-dark(oklch(48% 0.18 25), oklch(72% 0.16 25));
			--uncial-color-focus-ring: var(--uncial-color-primary);
			--uncial-font-body: ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
			--uncial-font-mono:
				ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
				monospace;
			--uncial-font-size-base: 1rem;
			--uncial-radius-md: 0.375rem;
			--uncial-radius-lg: 0.5rem;
			--uncial-space-1: 0.25rem;
			--uncial-space-2: 0.5rem;
			--uncial-space-3: 0.75rem;
			--uncial-space-4: 1rem;
			--uncial-space-5: 1.25rem;
			--uncial-space-6: 1.5rem;
			--uncial-shadow-sm: 0 1px 2px color-mix(in srgb, black 8%, transparent);
			--uncial-shadow-md: 0 10px 25px color-mix(in srgb, black 14%, transparent);
			--uncial-transition: 140ms ease;
		}
	}

	.dashboard {
		--uncial-dashboard-muted: color-mix(
			in srgb,
			var(--uncial-color-text) 78%,
			var(--uncial-color-bg)
		);
		color-scheme: light dark;
		border: 1px solid var(--uncial-color-border);
		border-radius: var(--uncial-radius-lg);
		background: var(--uncial-color-bg);
		color: var(--uncial-color-text);
		font-family: var(--uncial-font-body);
		font-size: var(--uncial-font-size-base);
		line-height: 1.5;
	}

	.dashboard[data-theme='light'] {
		color-scheme: light;
	}

	.dashboard[data-theme='dark'] {
		color-scheme: dark;
	}

	.topbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--uncial-space-3);
		padding: var(--uncial-space-3) var(--uncial-space-4);
		border-bottom: 1px solid var(--uncial-color-border);
		border-radius: var(--uncial-radius-lg) var(--uncial-radius-lg) 0 0;
		background: var(--uncial-color-surface-elevated);
	}

	.identity {
		flex: 1 1 10rem;
		min-width: 0;
	}

	.identity p,
	.status {
		margin: 0;
	}

	.name {
		font-weight: 700;
	}

	.location {
		color: var(--uncial-dashboard-muted);
		font-family: var(--uncial-font-mono);
		font-size: 0.8125rem;
		overflow-wrap: anywhere;
	}

	.session {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--uncial-space-2);
		font-size: 0.875rem;
	}

	.body {
		display: grid;
		grid-template-columns: 11rem minmax(0, 1fr);
	}

	.nav {
		padding: var(--uncial-space-3);
		border-right: 1px solid var(--uncial-color-border);
	}

	.nav ul {
		display: grid;
		gap: var(--uncial-space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.nav a {
		display: block;
		padding: var(--uncial-space-2) var(--uncial-space-3);
		border-radius: var(--uncial-radius-md);
		color: var(--uncial-color-text);
		font-weight: 600;
		text-decoration: none;
	}

	.nav a:hover {
		background: var(--uncial-color-surface-elevated);
	}

	.nav a[aria-current='page'] {
		background: var(--uncial-color-primary);
		color: var(--uncial-color-primary-contrast);
	}

	.content {
		min-width: 0;
		padding: var(--uncial-space-6);
	}

	.content:only-child {
		grid-column: 1 / -1;
	}

	h1 {
		margin: 0 0 var(--uncial-space-5);
		font-size: 1.5rem;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.back {
		display: inline-block;
		margin-bottom: var(--uncial-space-3);
		color: var(--uncial-color-primary);
	}

	.reason {
		margin: 0 0 var(--uncial-space-4);
	}

	.dashboard .topbar .menu-button {
		display: none;
	}

	.dashboard :global(:is(a, button, input, h1, [tabindex]):focus-visible) {
		outline: 2px solid var(--uncial-color-focus-ring);
		outline-offset: 2px;
	}

	.dashboard :global(:is(.btn, .uncial-cms-media-upload, .uncial-cms-media-delete)) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-height: 2.25rem;
		padding: 0 var(--uncial-space-3);
		border: 1px solid var(--uncial-color-border-strong);
		border-radius: var(--uncial-radius-md);
		background: var(--uncial-color-surface);
		color: var(--uncial-color-text);
		font: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1;
		text-decoration: none;
		cursor: pointer;
		transition: background var(--uncial-transition);
	}

	.dashboard
		:global(:is(.btn, .uncial-cms-media-upload, .uncial-cms-media-delete):hover:not(:disabled)) {
		background: var(--uncial-color-surface-elevated);
	}

	.dashboard :global(:is(.btn, .uncial-cms-media-upload):disabled) {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.dashboard :global(:is(.btn-primary, .uncial-cms-media-upload)),
	.dashboard :global(:is(.btn-primary, .uncial-cms-media-upload):hover:not(:disabled)) {
		border-color: var(--uncial-color-primary);
		background: var(--uncial-color-primary);
		color: var(--uncial-color-primary-contrast);
	}

	.dashboard :global(:is(.btn-danger, .uncial-cms-media-delete)) {
		border-color: color-mix(in srgb, var(--uncial-color-danger) 70%, var(--uncial-color-border));
		color: var(--uncial-color-danger);
	}

	.dashboard :global(.visually-hidden) {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 40rem) {
		.dashboard .topbar .menu-button {
			display: inline-flex;
		}

		.body {
			grid-template-columns: minmax(0, 1fr);
		}

		.nav {
			display: none;
			border-right: 0;
			border-bottom: 1px solid var(--uncial-color-border);
		}

		.nav.open {
			display: block;
		}

		.content {
			padding: var(--uncial-space-4);
		}
	}
</style>
