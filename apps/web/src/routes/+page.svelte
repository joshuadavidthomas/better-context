<script lang="ts">
	import { getShikiStore } from '$lib/stores/ShikiStore.svelte';
	import { getThemeStore } from '$lib/stores/theme.svelte';
	import btcaApp from '$lib/assets/btca-app.png';

	const DEMO = `btca ask --resource svelte --question "How does the $state rune work?"

# clones the repo locally
# searches real files (not docs)
# answers with citations + snippets`;

	const shikiStore = getShikiStore();
	const themeStore = getThemeStore();
	const shikiTheme = $derived(themeStore.theme === 'dark' ? 'dark-plus' : 'light-plus');
</script>

<svelte:head>
	<title>btca</title>
	<meta
		name="description"
		content="btca helps you ask questions about real codebases with a CLI and web app."
	/>
</svelte:head>

<section class="flex flex-col gap-14">
	<section class="flex flex-col gap-5">
		<h1 class="bc-h1 text-balance text-5xl sm:text-6xl lg:text-7xl bc-reveal" style="--delay: 90ms">
			Better Context for
			<span class="text-[hsl(var(--bc-accent))]">You and Your Agents</span>
		</h1>

		<p class="bc-prose max-w-xl text-pretty text-base sm:text-lg bc-reveal" style="--delay: 160ms">
			Search real repos with the CLI or the web app, and get answers grounded in source code.
		</p>

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center bc-reveal" style="--delay: 230ms">
			<a href="/app" class="bc-chip bc-btnPrimary justify-center">Go to the app</a>
			<a href="/cli" class="bc-chip justify-center">Use the CLI</a>
			<a href="/pricing" class="bc-chip justify-center">See pricing</a>
		</div>
	</section>

	<section class="bc-card bc-ring bc-cardHover overflow-hidden">
		<div class="flex items-center justify-between gap-4 px-5 py-4">
			<div class="bc-badge bc-badgeAccent">
				<span class="bc-kickerDot"></span>
				<span>CLI</span>
			</div>
			<div class="text-xs font-semibold tracking-[0.16em] uppercase bc-muted">example</div>
		</div>

		<div class="px-5 pb-5">
			<div class="bc-codeFrame">
				<div
					class="flex items-center justify-between gap-3 border-b border-[color-mix(in_oklab,hsl(var(--bc-border))_60%,transparent)] px-4 py-3"
				>
					<div class="flex items-center gap-2">
						<span class="size-2 bg-[hsl(var(--bc-fg))]"></span>
						<span class="size-2 bg-[hsl(var(--bc-fg))]"></span>
						<span class="size-2 bg-[hsl(var(--bc-fg))]"></span>
					</div>
					<div class="text-xs bc-muted">btca</div>
				</div>

				<div class="p-4">
					{#if shikiStore.highlighter}
						{@html shikiStore.highlighter.codeToHtml(DEMO, {
							theme: shikiTheme,
							lang: 'bash',
							rootStyle: 'background-color: transparent; padding: 0; margin: 0;'
						})}
					{:else}
						<pre class="m-0 whitespace-pre-wrap text-sm leading-relaxed"><code>{DEMO}</code></pre>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<section class="bc-card bc-ring p-5">
		<div class="text-xs font-semibold uppercase tracking-[0.16em] bc-muted">Web app</div>
		<img
			src={btcaApp}
			alt="btca chat interface"
			class="mt-3 w-full rounded-lg border border-[hsl(var(--bc-border))]"
			loading="lazy"
		/>
	</section>

	<section class="bc-card bc-ring p-6">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<div class="text-sm font-semibold">More to explore</div>
				<p class="mt-1 text-sm bc-prose">Pricing, resources, setup, and configuration docs.</p>
			</div>
			<div class="flex flex-wrap gap-3">
				<a href="/pricing" class="bc-chip">Pricing</a>
				<a href="/resources" class="bc-chip">Resources</a>
				<a href="/cli" class="bc-chip">CLI</a>
				<a href="/web" class="bc-chip">Web app</a>
				<a href="/config" class="bc-chip">Config</a>
			</div>
		</div>
	</section>
</section>
