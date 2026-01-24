<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { Key, Loader2, Plus, Trash2, ExternalLink } from '@lucide/svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Id } from '../../../../convex/_generated/dataModel';
	import { getAuthState } from '$lib/stores/auth.svelte';
	import { getShikiStore } from '$lib/stores/ShikiStore.svelte';
	import { getThemeStore } from '$lib/stores/theme.svelte';
	import CopyButton from '$lib/CopyButton.svelte';
	import { page } from '$app/state';

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

	type McpTool = 'cursor' | 'opencode' | 'claude-code';
	let selectedTool = $state<McpTool>('cursor');

	const mcpUrl = $derived(
		page.url.hostname === 'localhost' ? `${page.url.origin}/api/mcp` : 'https://btca.dev/api/mcp'
	);

	const toolConfigs = $derived({
		cursor: {
			name: 'Cursor',
			docsUrl: 'https://cursor.com/docs/context/mcp#using-mcpjson',
			filename: '.cursor/mcp.json',
			config: JSON.stringify(
				{
					mcpServers: {
						'better-context': {
							url: mcpUrl,
							headers: {
								Authorization: 'Bearer YOUR_API_KEY'
							}
						}
					}
				},
				null,
				2
			)
		},
		opencode: {
			name: 'OpenCode',
			docsUrl: 'https://opencode.ai/docs/mcp-servers/#remote',
			filename: 'opencode.json',
			config: JSON.stringify(
				{
					$schema: 'https://opencode.ai/config.json',
					mcp: {
						'better-context': {
							type: 'remote',
							url: mcpUrl,
							enabled: true,
							headers: {
								Authorization: 'Bearer YOUR_API_KEY'
							}
						}
					}
				},
				null,
				2
			)
		},
		'claude-code': {
			name: 'Claude Code',
			docsUrl: 'https://code.claude.com/docs/en/mcp#option-1:-add-a-remote-http-server',
			filename: 'Terminal command',
			config: `claude mcp add --transport http better-context ${mcpUrl} \\
  --header "Authorization: Bearer YOUR_API_KEY"`
		}
	});

	const currentConfig = $derived(toolConfigs[selectedTool]);

	const shikiStore = getShikiStore();
	const themeStore = getThemeStore();
	const shikiTheme = $derived(themeStore.theme === 'dark' ? 'dark-plus' : 'light-plus');

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

					<div class="mb-4 flex gap-1 rounded-lg bg-[hsl(var(--bc-bg-secondary))] p-1">
						{#each Object.entries(toolConfigs) as [key, tool]}
							<button
								type="button"
								class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {selectedTool ===
								key
									? 'bg-[hsl(var(--bc-bg))] shadow-sm'
									: 'bc-muted hover:text-[hsl(var(--bc-text))]'}"
								onclick={() => (selectedTool = key as McpTool)}
							>
								{tool.name}
							</button>
						{/each}
					</div>

					<div class="mb-3 flex items-center justify-between">
						<p class="bc-muted text-sm">
							{#if selectedTool === 'claude-code'}
								Run this command in your terminal:
							{:else}
								Add this to <code class="rounded bg-[hsl(var(--bc-bg-secondary))] px-1"
									>{currentConfig.filename}</code
								>:
							{/if}
						</p>
						<a
							href={currentConfig.docsUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="bc-muted flex items-center gap-1 text-xs hover:text-[hsl(var(--bc-text))]"
						>
							Docs
							<ExternalLink size={12} />
						</a>
					</div>
					<div class="bc-codeFrame">
						<div class="flex items-center justify-between gap-3 p-4">
							<div class="min-w-0 flex-1 overflow-x-auto">
								{#if shikiStore.highlighter}
									{@html shikiStore.highlighter.codeToHtml(currentConfig.config, {
										theme: shikiTheme,
										lang: selectedTool === 'claude-code' ? 'bash' : 'json',
										rootStyle: 'background-color: transparent; padding: 0; margin: 0;'
									})}
								{:else}
									<pre class="m-0 whitespace-pre text-sm leading-relaxed"><code
											>{currentConfig.config}</code
										></pre>
								{/if}
							</div>
							<CopyButton text={currentConfig.config} label="Copy configuration" />
						</div>
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
					<div class="bc-codeFrame">
						<div class="flex items-center justify-between gap-3 p-4">
							<div class="min-w-0 flex-1 overflow-x-auto">
								<pre class="m-0 whitespace-pre-wrap text-sm leading-relaxed"><code
										>{agentInstructions}</code
									></pre>
							</div>
							<CopyButton text={agentInstructions} label="Copy agent instructions" />
						</div>
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
		<!-- svelte-ignore a11y_no_static_element_interactions -->
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
					<CopyButton text={newlyCreatedKey} label="Copy API key" />
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
