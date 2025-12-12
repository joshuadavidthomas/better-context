<script lang="ts">
	import { Bot } from '@lucide/svelte';
</script>

<section class="mx-auto w-[1200px] max-w-full">
	<div
		class="relative h-[630px] overflow-hidden border border-neutral-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40"
	>
		<div
			aria-hidden="true"
			class="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_20%_-10%,rgba(249,115,22,0.20),transparent_60%),radial-gradient(50rem_30rem_at_90%_0%,rgba(249,115,22,0.12),transparent_55%),radial-gradient(50rem_30rem_at_70%_110%,rgba(249,115,22,0.12),transparent_55%)] dark:bg-[radial-gradient(60rem_40rem_at_20%_-10%,rgba(249,115,22,0.14),transparent_60%),radial-gradient(50rem_30rem_at_90%_0%,rgba(249,115,22,0.10),transparent_55%),radial-gradient(50rem_30rem_at_70%_110%,rgba(249,115,22,0.10),transparent_55%)]"
		></div>

		<div class="relative flex h-full flex-col p-16">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div
						class="grid size-12 place-items-center rounded-2xl bg-linear-to-br from-orange-500 to-orange-700 text-white shadow-sm shadow-orange-500/20"
					>
						<Bot size={22} strokeWidth={2.25} />
					</div>
					<div class="leading-tight">
						<div
							class="text-base font-semibold tracking-tight text-neutral-950 dark:text-neutral-50"
						>
							Better Context
						</div>
						<div class="text-sm text-neutral-600 dark:text-neutral-400">btca CLI</div>
					</div>
				</div>

				<div class="text-sm text-neutral-600 dark:text-neutral-400">
					github.com/bmdavis419/better-context
				</div>
			</div>

			<div class="mt-14 max-w-[920px]">
				<div
					class="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-sm font-medium text-orange-700 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300"
				>
					AI Powered Docs Search
				</div>

				<h1
					class="mt-6 text-balance text-6xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50"
				>
					Ask a question. Search the actual codebase. Get a real answer.
				</h1>

				<p class="mt-5 text-pretty text-xl leading-relaxed text-neutral-700 dark:text-neutral-300">
					Local-first CLI that clones repos and searches source directly.
				</p>
			</div>

			<div class="mt-auto flex items-end justify-between gap-10">
				<div class="flex flex-col gap-3 text-base text-neutral-700 dark:text-neutral-300">
					<div class="flex items-center gap-3">
						<span class="size-2 rounded-full bg-orange-600"></span>
						<span>Subcommands: ask · chat · serve · open</span>
					</div>
					<div class="flex items-center gap-3">
						<span class="size-2 rounded-full bg-orange-600"></span>
						<span>Built with Bun + Effect + SvelteKit</span>
					</div>
				</div>

				<div
					class="w-[520px] overflow-hidden border border-neutral-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40"
				>
					<pre
						class="overflow-x-auto p-4 text-base leading-relaxed text-neutral-900 dark:text-neutral-50"><code
							>bun add -g btca
btca ask -t svelte -q "How do stores work?"</code
						></pre>
				</div>
			</div>
		</div>
	</div>
</section>
