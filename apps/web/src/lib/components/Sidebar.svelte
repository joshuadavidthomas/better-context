<script lang="ts">
	import {
		BookOpen,
		Bot,
		CreditCard,
		Github,
		Home,
		Key,
		Loader2,
		Menu,
		Moon,
		Plus,
		Search,
		Settings,
		Sun,
		Trash2,
		User,
		X
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { createEventDispatcher } from 'svelte';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { getAuthState, openSignIn, openUserProfile, signOut } from '$lib/stores/auth.svelte';
	import { getThemeStore } from '$lib/stores/theme.svelte';
	import { getBillingStore } from '$lib/stores/billing.svelte';
	import InstanceStatus from '$lib/components/InstanceStatus.svelte';
	import { trackEvent, ClientAnalyticsEvents } from '$lib/stores/analytics.svelte';

	type ThreadItem = {
		_id: string;
		title?: string | null;
		lastActivityAt: number;
		isStreaming?: boolean;
	};

	interface Props {
		threads: ThreadItem[];
		currentThreadId: string | null;
		isOpen: boolean;
		isLoading?: boolean;
	}

	let { threads, currentThreadId, isOpen, isLoading = false }: Props = $props();

	const dispatch = createEventDispatcher<{ close: void }>();
	const auth = getAuthState();
	const billingStore = getBillingStore();
	const themeStore = getThemeStore();
	const client = useConvexClient();

	let searchValue = $state('');
	let showUserMenu = $state(false);

	const filteredThreads = $derived.by(() => {
		const query = searchValue.trim().toLowerCase();
		if (!query) return threads;
		return threads.filter((thread) => (thread.title ?? thread._id).toLowerCase().includes(query));
	});

	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function handleNavigate() {
		if (isOpen) dispatch('close');
	}

	function createNewThread() {
		goto('/app/chat/new');
		handleNavigate();
	}

	async function destroyThread(threadId: string) {
		if (!confirm('Are you sure you want to delete this thread?')) return;
		try {
			await client.mutation(api.threads.remove, { threadId: threadId as any });
		} catch (error) {
			console.error('Failed to delete thread:', error);
		}
	}

	function toggleTheme() {
		themeStore.toggle();
	}

	function handleSignOut() {
		showUserMenu = false;
		trackEvent(ClientAnalyticsEvents.USER_SIGNED_OUT);
		signOut();
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.sidebar-user-menu')) {
			showUserMenu = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="bc-sidebar-inner">
	<div class="bc-sidebar-section">
		<a href="/app" class="bc-chip w-full justify-start" aria-label="Go to app home">
			<div class="bc-logoMark h-9 w-9">
				<Bot size={16} strokeWidth={2.25} />
			</div>
			<div class="min-w-0">
				<div class="bc-title text-sm">Better Context</div>
				<div class="bc-subtitle text-[11px]">Chat workspace</div>
			</div>
		</a>
	</div>

	<div class="bc-sidebar-section">
		<div class="bc-sidebar-actions">
			<button type="button" class="bc-btn bc-btn-primary text-xs" onclick={createNewThread}>
				New Thread
			</button>
			<a href="/app/settings/resources" class="bc-btn text-xs" onclick={handleNavigate}>
				Resources
			</a>
		</div>
	</div>

	<div class="bc-sidebar-section">
		<div class="bc-sidebar-search">
			<Search size={14} class="bc-muted" />
			<input
				type="text"
				class="bc-sidebar-search-input"
				placeholder="Search threads"
				bind:value={searchValue}
			/>
			{#if searchValue}
				<button
					type="button"
					class="bc-sidebar-clear"
					onclick={() => (searchValue = '')}
					aria-label="Clear search"
				>
					<X size={14} />
				</button>
			{/if}
		</div>
	</div>

	<div class="bc-sidebar-section">
		<InstanceStatus />
	</div>

	<div class="bc-thread-list" aria-live="polite">
		{#if isLoading}
			<div class="flex items-center gap-2 px-3 py-2 text-xs">
				<Loader2 size={14} class="animate-spin" />
				Loading threads...
			</div>
		{:else if filteredThreads.length === 0}
			<div class="px-3 py-2 text-xs">
				<div class="font-semibold">
					{searchValue ? 'No matches found' : 'No threads yet'}
				</div>
				<p class="bc-muted mt-1">
					{searchValue ? 'Try a different search.' : 'Create a new thread to get started.'}
				</p>
			</div>
		{:else}
			{#each filteredThreads as thread (thread._id)}
				<a
					href="/app/chat/{thread._id}"
					class={currentThreadId === thread._id
						? 'bc-thread-item bc-thread-item-active'
						: 'bc-thread-item'}
					onclick={handleNavigate}
				>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2 truncate text-sm font-semibold">
							{thread.title ?? `Thread ${thread._id.slice(0, 8)}...`}
							{#if thread.isStreaming}
								<Loader2 size={12} class="shrink-0 animate-spin text-[hsl(var(--bc-accent))]" />
							{/if}
						</div>
						<div class="bc-muted mt-1 text-[11px]">
							{formatDate(thread.lastActivityAt)}
						</div>
					</div>
					<button
						type="button"
						class="bc-thread-item-delete"
						onclick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							destroyThread(thread._id);
						}}
					>
						<Trash2 size={14} />
					</button>
				</a>
			{/each}
		{/if}
	</div>

	<div class="bc-sidebar-section bc-sidebar-footer">
		{#if auth.isSignedIn && auth.user}
			<div class="sidebar-user-menu relative">
				<button
					type="button"
					class="bc-chip w-full justify-between"
					onclick={() => (showUserMenu = !showUserMenu)}
				>
					<div class="flex min-w-0 items-center gap-2">
						{#if auth.user.imageUrl}
							<img
								src={auth.user.imageUrl}
								alt={auth.user.fullName ?? 'User'}
								class="h-7 w-7 rounded-full"
							/>
						{:else}
							<div class="bc-logoMark h-7 w-7">
								<User size={14} />
							</div>
						{/if}
						<div class="min-w-0 flex flex-col items-start">
							<div class="truncate text-xs font-semibold">
								{auth.user.fullName ?? 'User'}
							</div>
						</div>
					</div>
					<Menu size={14} />
				</button>

				{#if showUserMenu}
					<div
						class="bc-card bc-sidebar-dropdown absolute bottom-full left-0 right-0 mb-2 p-2 text-xs"
					>
						<button
							type="button"
							class="bc-sidebar-menu-item"
							onclick={() => {
								showUserMenu = false;
								openUserProfile();
							}}
						>
							<User size={14} />
							Profile
						</button>
						{#if billingStore.isSubscribed}
							<a href="/app/settings/usage" class="bc-sidebar-menu-item" onclick={handleNavigate}>
								<Settings size={14} />
								Usage
							</a>
						{:else if billingStore.isOnFreePlan}
							<a href="/pricing" class="bc-sidebar-menu-item" onclick={handleNavigate}>
								<Settings size={14} />
								Pricing
							</a>
							<div class="bc-sidebar-menu-item bc-muted text-xs">
								{billingStore.freeMessagesRemaining} / {billingStore.freeMessagesTotal} free messages
							</div>
						{:else}
							<a href="/pricing" class="bc-sidebar-menu-item" onclick={handleNavigate}>
								<Settings size={14} />
								Pricing
							</a>
						{/if}
						<a href="/app/settings/billing" class="bc-sidebar-menu-item" onclick={handleNavigate}>
							<CreditCard size={14} />
							Billing
						</a>
						<a href="/app/settings/resources" class="bc-sidebar-menu-item" onclick={handleNavigate}>
							<BookOpen size={14} />
							Resources
						</a>
						<a href="/app/settings/mcp" class="bc-sidebar-menu-item" onclick={handleNavigate}>
							<Key size={14} />
							MCP Server
						</a>
						<a href="/" class="bc-sidebar-menu-item" onclick={handleNavigate}>
							<Home size={14} />
							Home
						</a>
						<button type="button" class="bc-sidebar-menu-item" onclick={toggleTheme}>
							{#if themeStore.theme === 'dark'}
								<Sun size={14} />
								Light mode
							{:else}
								<Moon size={14} />
								Dark mode
							{/if}
						</button>
						<a
							href="https://github.com/bmdavis419/better-context"
							target="_blank"
							rel="noreferrer"
							class="bc-sidebar-menu-item"
						>
							<Github size={14} />
							GitHub
						</a>
						<button type="button" class="bc-sidebar-menu-item text-red-500" onclick={handleSignOut}>
							<User size={14} />
							Sign out
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<button
				type="button"
				class="bc-btn bc-btn-primary w-full text-xs"
				onclick={() => openSignIn()}
			>
				Sign in
			</button>
		{/if}
	</div>
</div>
