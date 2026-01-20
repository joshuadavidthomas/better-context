<script lang="ts">
	import PricingPlans from '$lib/components/pricing/PricingPlans.svelte';
	import { goto } from '$app/navigation';

	function handleSignIn() {
		goto('/app');
	}
</script>

<svelte:head>
	<title>btca | Pricing</title>
	<meta name="description" content="Pricing for the btca web app and hosted sandbox." />
</svelte:head>

<section class="flex flex-col gap-12">
	<header class="flex flex-col gap-5">
		<div class="bc-kicker">
			<span class="bc-kickerDot"></span>
			<span>Pricing</span>
		</div>
		<h1 class="bc-h1 text-balance text-5xl sm:text-6xl">Simple plans for the web app.</h1>
		<p class="bc-prose max-w-2xl text-pretty text-base sm:text-lg">
			Chat interface, search codebases with a cloud sandbox, and a MCP server coming soon...
		</p>
	</header>

	<div class="mx-auto w-full max-w-5xl">
		<PricingPlans isSignedIn={false} isSubscribed={false} onSignIn={handleSignIn} />
	</div>
</section>
