<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { Copy, Key, Loader2, Plus, Trash2 } from '@lucide/svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Id } from '../../../../convex/_generated/dataModel';
	import { getAuthState } from '$lib/stores/auth.svelte';
	import { page } from '$app/stores';

	const auth = getAuthState();
	const client = useConvexClient();

	const instanceId = $derived(auth.instanceId);

	const apiKeysQuery = $derived(
		instanceId ? useQuery(api.apiKeys.listByUser, { userId: instanceId }) : null
	);
	const apiKeys = $derived(apiKeysQuery?.data ?? []);

	let newKeyName = $state('');
	let newlyCreatedKey = $state<string | null>(null);
	let isCreating = $state(false);
	let showCreateModal = $state(false);
	let copiedText = $state<string | null>(null);

	const baseUrl = $derived($page.url.origin);

	const mcpConfig = $derived(
		JSON.stringify(
			{
				mcpServers: {
					'better-context': {
						type: 'http',
						url: `${baseUrl}/api/mcp`,
						headers: {
							Authorization: 'Bearer YOUR_API_KEY'
						}
					}
				}
			},
			null,
			2
		)
	);

	const agentInstructions = `## Better Context MCP

Use the Better Context MCP for documentation questions.

**Required workflow:**
1. Call \`listResources\` first to see available resources
2. Call \`ask\` with your question and resource names from step 1

**Rules:**
- Always call \`listResources\` before \`ask\`
- Use exact \`name\` values from \`listResources\` in the \`resources\` array
- Include at least one resource in every \`ask\` call
- Only include resources relevant to your question`;

	async function handleCreateKey() {
		if (!instanceId || !newKeyName.trim()) return;

		isCreating = true;
		try {
			const result = await client.mutation(api.apiKeys.create, {
				userId: instanceId,
				name: newKeyName.trim()
			});
			newlyCreatedKey = result.key;
			newKeyName = '';
		} finally {
			isCreating = false;
		}
	}

	async function handleRevokeKey(keyId: Id<'apiKeys'>) {
		if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
		await client.mutation(api.apiKeys.revoke, { keyId });
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		copiedText = text;
		setTimeout(() => {
			copiedText = null;
		}, 2000);
	}

	function formatDate(timestamp: number) {
		return new Date(timestamp).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function closeCreateModal() {
		showCreateModal = false;
		newlyCreatedKey = null;
		newKeyName = '';
	}
</script>

<div class="flex flex-1 overflow-hidden">
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-8 overflow-y-auto p-8">
		<div>
			<h1 class="text-2xl font-semibold">MCP Server</h1>
			<p class="bc-muted mt-1 text-sm">
				Connect Better Context to your AI tools via the Model Context Protocol.
			</p>
		</div>

		<!-- API Keys Section -->
		<section class="space-y-4">
			<div class="flex items-center justify-between">
				<div>
					<h2 class="text-lg font-semibold">API Keys</h2>
					<p class="bc-muted text-sm">Manage your API keys for MCP access.</p>
				</div>
				<button
					type="button"
					class="bc-btn bc-btn-primary"
					onclick={() => (showCreateModal = true)}
				>
					<Plus size={16} />
					Create Key
				</button>
			</div>

			{#if apiKeysQuery?.isLoading}
				<div class="bc-card flex items-center justify-center p-8">
					<Loader2 size={24} class="animate-spin" />
				</div>
			{:else if apiKeys.length === 0}
				<div class="bc-card p-6 text-center">
					<Key size={32} class="bc-muted mx-auto mb-3" />
					<p class="font-medium">No API keys yet</p>
					<p class="bc-muted mt-1 text-sm">Create one to connect your MCP clients.</p>
				</div>
			{:else}
				<div class="bc-card overflow-hidden">
					<table class="w-full text-sm">
						<thead class="border-b border-[hsl(var(--bc-border))]">
							<tr>
								<th class="bc-muted px-4 py-3 text-left text-xs font-medium uppercase">Name</th>
								<th class="bc-muted px-4 py-3 text-left text-xs font-medium uppercase">Key</th>
								<th class="bc-muted px-4 py-3 text-left text-xs font-medium uppercase">Created</th>
								<th class="bc-muted px-4 py-3 text-left text-xs font-medium uppercase">Last Used</th
								>
								<th class="bc-muted px-4 py-3 text-left text-xs font-medium uppercase">Usage</th>
								<th class="bc-muted px-4 py-3 text-left text-xs font-medium uppercase">Status</th>
								<th class="px-4 py-3"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-[hsl(var(--bc-border))]">
							{#each apiKeys as key}
								<tr>
									<td class="px-4 py-3 font-medium">{key.name}</td>
									<td class="px-4 py-3 font-mono text-xs">{key.keyPrefix}...</td>
									<td class="bc-muted px-4 py-3">{formatDate(key.createdAt)}</td>
									<td class="bc-muted px-4 py-3">
										{key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
									</td>
									<td class="bc-muted px-4 py-3">{key.usageCount ?? 0}</td>
									<td class="px-4 py-3">
										{#if key.revokedAt}
											<span class="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-500">
												Revoked
											</span>
										{:else}
											<span class="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-500">
												Active
											</span>
										{/if}
									</td>
									<td class="px-4 py-3 text-right">
										{#if !key.revokedAt}
											<button
												type="button"
												class="bc-muted hover:text-red-500"
												onclick={() => handleRevokeKey(key._id)}
												title="Revoke key"
											>
												<Trash2 size={16} />
											</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<!-- MCP Setup Section -->
		<section class="space-y-4">
			<div>
				<h2 class="text-lg font-semibold">Setup Guide</h2>
				<p class="bc-muted text-sm">Configure your MCP client to use Better Context.</p>
			</div>

			<div class="space-y-6">
				<div class="bc-card p-5">
					<h3 class="mb-3 font-medium">1. Add to your MCP configuration</h3>
					<p class="bc-muted mb-3 text-sm">
						Add this to your MCP servers config (e.g., in opencode, Cursor, or Claude Desktop):
					</p>
					<div class="relative">
						<pre
							class="overflow-x-auto rounded-md bg-[hsl(var(--bc-bg-secondary))] p-4 text-sm">{mcpConfig}</pre>
						<button
							type="button"
							class="bc-btn absolute right-2 top-2 text-xs"
							onclick={() => copyToClipboard(mcpConfig)}
						>
							<Copy size={14} />
							{copiedText === mcpConfig ? 'Copied!' : 'Copy'}
						</button>
					</div>
					<p class="bc-muted mt-3 text-sm">
						Replace <code class="rounded bg-[hsl(var(--bc-bg-secondary))] px-1">YOUR_API_KEY</code> with
						an API key from above.
					</p>
				</div>

				<div class="bc-card p-5">
					<h3 class="mb-3 font-medium">2. Add agent instructions (optional)</h3>
					<p class="bc-muted mb-3 text-sm">
						Add this to your <code class="rounded bg-[hsl(var(--bc-bg-secondary))] px-1"
							>AGENTS.md</code
						> or system prompt:
					</p>
					<div class="relative">
						<pre
							class="overflow-x-auto rounded-md bg-[hsl(var(--bc-bg-secondary))] p-4 text-sm whitespace-pre-wrap">{agentInstructions}</pre>
						<button
							type="button"
							class="bc-btn absolute right-2 top-2 text-xs"
							onclick={() => copyToClipboard(agentInstructions)}
						>
							<Copy size={14} />
							{copiedText === agentInstructions ? 'Copied!' : 'Copy'}
						</button>
					</div>
				</div>
			</div>
		</section>
	</div>
</div>

<!-- Create Key Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="absolute inset-0" onclick={closeCreateModal}></div>
		<div class="bc-card relative z-10 w-full max-w-md p-6">
			{#if newlyCreatedKey}
				<h3 class="text-lg font-semibold">API Key Created</h3>
				<p class="bc-muted mt-2 text-sm">
					Copy your API key now. You won't be able to see it again.
				</p>
				<div class="mt-4 flex items-center gap-2">
					<code
						class="flex-1 break-all rounded bg-[hsl(var(--bc-bg-secondary))] p-3 text-sm text-green-500"
					>
						{newlyCreatedKey}
					</code>
					<button type="button" class="bc-btn" onclick={() => copyToClipboard(newlyCreatedKey!)}>
						<Copy size={16} />
						{copiedText === newlyCreatedKey ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<button type="button" class="bc-btn mt-4 w-full" onclick={closeCreateModal}> Done </button>
			{:else}
				<h3 class="text-lg font-semibold">Create API Key</h3>
				<p class="bc-muted mt-2 text-sm">
					Give your key a name to help you remember what it's used for.
				</p>
				<input
					type="text"
					bind:value={newKeyName}
					placeholder="e.g., Cursor, opencode, Claude Desktop"
					class="bc-input mt-4 w-full"
					onkeydown={(e) => e.key === 'Enter' && handleCreateKey()}
				/>
				<div class="mt-4 flex gap-2">
					<button type="button" class="bc-btn flex-1" onclick={closeCreateModal}> Cancel </button>
					<button
						type="button"
						class="bc-btn bc-btn-primary flex-1"
						onclick={handleCreateKey}
						disabled={isCreating || !newKeyName.trim()}
					>
						{#if isCreating}
							<Loader2 size={16} class="animate-spin" />
							Creating...
						{:else}
							Create
						{/if}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
