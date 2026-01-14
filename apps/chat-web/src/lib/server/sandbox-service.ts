import { Daytona, type Sandbox } from '@daytonaio/sdk';
import { env } from '$env/dynamic/private';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { PUBLIC_CONVEX_URL } from '$env/static/public';

// Daytona instance (singleton)
let daytonaInstance: Daytona | null = null;

// Snapshot name for btca sandbox
const BTCA_SNAPSHOT_NAME = 'btca-sandbox';

// Auto-stop interval in minutes (sandbox stops after this period of inactivity)
const AUTO_STOP_INTERVAL = 60;

// Server port for btca serve
const BTCA_SERVER_PORT = 3000;

export type SandboxState = 'pending' | 'starting' | 'active' | 'stopped' | 'error';

export interface ResourceConfig {
	name: string;
	type: 'git';
	url: string;
	branch: string;
	searchPath?: string;
	specialNotes?: string;
}

function getDaytona(): Daytona {
	if (!daytonaInstance) {
		daytonaInstance = new Daytona({
			apiKey: env.DAYTONA_API_KEY,
			apiUrl: env.DAYTONA_API_URL
		});
	}
	return daytonaInstance;
}

function getConvexClient(): ConvexHttpClient {
	return new ConvexHttpClient(PUBLIC_CONVEX_URL);
}

/**
 * Generate btca config from resources
 */
function generateBtcaConfig(resources: ResourceConfig[]): string {
	return JSON.stringify(
		{
			$schema: 'https://btca.dev/btca.schema.json',
			resources: resources.map((r) => ({
				name: r.name,
				type: r.type,
				url: r.url,
				branch: r.branch,
				searchPath: r.searchPath,
				specialNotes: r.specialNotes
			})),
			model: 'claude-haiku-4-5',
			provider: 'opencode'
		},
		null,
		2
	);
}

/**
 * Wait for btca server to be ready in the sandbox
 */
async function waitForBtcaServer(sandbox: Sandbox, maxRetries = 15): Promise<boolean> {
	for (let i = 0; i < maxRetries; i++) {
		await new Promise((resolve) => setTimeout(resolve, 2000));

		try {
			const healthCheck = await sandbox.process.executeCommand(
				`curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:${BTCA_SERVER_PORT}/`
			);

			const statusCode = healthCheck.result.trim();
			if (statusCode === '200') {
				return true;
			}
		} catch {
			// Continue retrying
		}
	}
	return false;
}

/**
 * Create and start a new sandbox for a thread
 */
export async function createSandbox(
	threadId: Id<'threads'>,
	resources: ResourceConfig[],
	onStatusChange?: (status: SandboxState) => void
): Promise<{ sandboxId: string; serverUrl: string }> {
	const daytona = getDaytona();
	const convex = getConvexClient();

	try {
		// Update status: starting
		onStatusChange?.('starting');
		await convex.mutation(api.threads.updateSandboxState, {
			threadId,
			sandboxState: 'starting'
		});

		// Create sandbox from pre-built snapshot
		const sandbox = await daytona.create({
			snapshot: BTCA_SNAPSHOT_NAME,
			autoStopInterval: AUTO_STOP_INTERVAL,
			envVars: {
				NODE_ENV: 'production',
				OPENCODE_API_KEY: env.OPENCODE_API_KEY ?? ''
			},
			public: true
		});

		// Generate and upload btca config
		const btcaConfig = generateBtcaConfig(resources);
		await sandbox.fs.uploadFile(Buffer.from(btcaConfig), '/root/btca.config.jsonc');

		// Create a session for the long-running server process
		const sandboxSessionId = 'btca-server-session';
		await sandbox.process.createSession(sandboxSessionId);

		// Start the btca serve command
		await sandbox.process.executeSessionCommand(sandboxSessionId, {
			command: `cd /root && btca serve --port ${BTCA_SERVER_PORT}`,
			runAsync: true
		});

		// Wait for server to be ready
		const serverReady = await waitForBtcaServer(sandbox);

		if (!serverReady) {
			// Clean up and throw
			try {
				await sandbox.delete();
			} catch {
				// Ignore cleanup errors
			}
			throw new Error('Server failed to start in time');
		}

		// Get the preview link for the server
		const previewInfo = await sandbox.getPreviewLink(BTCA_SERVER_PORT);

		// Update Convex with sandbox info
		await convex.mutation(api.threads.updateSandboxState, {
			threadId,
			sandboxId: sandbox.id,
			sandboxState: 'active',
			serverUrl: previewInfo.url
		});

		onStatusChange?.('active');

		return {
			sandboxId: sandbox.id,
			serverUrl: previewInfo.url
		};
	} catch (error) {
		// Update Convex with error
		await convex.mutation(api.threads.updateSandboxState, {
			threadId,
			sandboxState: 'error',
			errorMessage: error instanceof Error ? error.message : 'Unknown error creating sandbox'
		});

		onStatusChange?.('error');
		throw error;
	}
}

/**
 * Get the current state of a sandbox from Daytona
 */
export async function getSandboxState(
	sandboxId: string
): Promise<'started' | 'stopped' | 'unknown'> {
	const daytona = getDaytona();

	try {
		const sandbox = await daytona.get(sandboxId);
		// Check sandbox state - the Daytona SDK exposes state differently
		const state = (sandbox as unknown as { instance?: { state?: string } }).instance?.state;
		if (state === 'started') {
			return 'started';
		} else if (state === 'stopped') {
			return 'stopped';
		}
		return 'unknown';
	} catch {
		return 'unknown';
	}
}

/**
 * Start a stopped sandbox
 */
export async function startSandbox(
	sandboxId: string,
	threadId: Id<'threads'>,
	onStatusChange?: (status: SandboxState) => void
): Promise<string> {
	const daytona = getDaytona();
	const convex = getConvexClient();

	try {
		onStatusChange?.('starting');
		await convex.mutation(api.threads.updateSandboxState, {
			threadId,
			sandboxState: 'starting'
		});

		const sandbox = await daytona.get(sandboxId);
		await sandbox.start(60); // 60 second timeout

		// Re-start the btca server (it won't be running after stop)
		const sandboxSessionId = 'btca-server-session';
		try {
			await sandbox.process.createSession(sandboxSessionId);
		} catch {
			// Session may already exist
		}

		await sandbox.process.executeSessionCommand(sandboxSessionId, {
			command: `cd /root && btca serve --port ${BTCA_SERVER_PORT}`,
			runAsync: true
		});

		// Wait for server to be ready
		const serverReady = await waitForBtcaServer(sandbox);

		if (!serverReady) {
			throw new Error('Server failed to start after resume');
		}

		// Get the preview link
		const previewInfo = await sandbox.getPreviewLink(BTCA_SERVER_PORT);

		// Update Convex
		await convex.mutation(api.threads.updateSandboxState, {
			threadId,
			sandboxState: 'active',
			serverUrl: previewInfo.url
		});

		onStatusChange?.('active');

		return previewInfo.url;
	} catch (error) {
		await convex.mutation(api.threads.updateSandboxState, {
			threadId,
			sandboxState: 'error',
			errorMessage: error instanceof Error ? error.message : 'Unknown error starting sandbox'
		});

		onStatusChange?.('error');
		throw error;
	}
}

/**
 * Stop a sandbox (free CPU/memory but keep disk)
 */
export async function stopSandbox(sandboxId: string, threadId: Id<'threads'>): Promise<void> {
	const daytona = getDaytona();
	const convex = getConvexClient();

	try {
		const sandbox = await daytona.get(sandboxId);
		await sandbox.stop();

		await convex.mutation(api.threads.updateSandboxState, {
			threadId,
			sandboxState: 'stopped'
		});
	} catch (error) {
		console.error('Error stopping sandbox:', error);
		// Don't throw - stopping is best effort
	}
}

/**
 * Delete a sandbox completely
 */
export async function deleteSandbox(sandboxId: string): Promise<void> {
	const daytona = getDaytona();

	try {
		const sandbox = await daytona.get(sandboxId);
		await sandbox.delete();
	} catch (error) {
		console.error('Error deleting sandbox:', error);
		// Don't throw - deletion is best effort
	}
}

/**
 * Ensure a sandbox is ready for use
 * - Creates new sandbox if pending
 * - Starts stopped sandbox
 * - Returns server URL
 */
export async function ensureSandboxReady(
	threadId: Id<'threads'>,
	sandboxId: string | undefined,
	sandboxState: SandboxState,
	serverUrl: string | undefined,
	resources: ResourceConfig[],
	onStatusChange?: (status: SandboxState) => void
): Promise<string> {
	// If no sandbox exists, create one
	if (!sandboxId || sandboxState === 'pending') {
		const result = await createSandbox(threadId, resources, onStatusChange);
		return result.serverUrl;
	}

	// If sandbox is active and we have a URL, check if it's actually running
	if (sandboxState === 'active' && serverUrl) {
		const actualState = await getSandboxState(sandboxId);

		if (actualState === 'started') {
			return serverUrl;
		}

		// Sandbox was stopped (auto-stop), need to restart
		if (actualState === 'stopped') {
			return await startSandbox(sandboxId, threadId, onStatusChange);
		}
	}

	// If sandbox is stopped, start it
	if (sandboxState === 'stopped') {
		return await startSandbox(sandboxId, threadId, onStatusChange);
	}

	// If we're in an error state, try to create a new sandbox
	if (sandboxState === 'error') {
		// Clean up old sandbox if it exists
		if (sandboxId) {
			await deleteSandbox(sandboxId);
		}
		const result = await createSandbox(threadId, resources, onStatusChange);
		return result.serverUrl;
	}

	// Fallback: create new sandbox
	const result = await createSandbox(threadId, resources, onStatusChange);
	return result.serverUrl;
}

/**
 * Stop all other active sandboxes for a user (enforce 1 active sandbox rule)
 */
export async function stopOtherSandboxes(
	userId: Id<'users'>,
	currentThreadId: Id<'threads'>
): Promise<void> {
	const convex = getConvexClient();

	try {
		const activeThreads = await convex.query(api.threads.listWithActiveSandbox, { userId });

		for (const thread of activeThreads) {
			if (thread._id !== currentThreadId && thread.sandboxId) {
				await stopSandbox(thread.sandboxId, thread._id);
			}
		}
	} catch (error) {
		console.error('Error stopping other sandboxes:', error);
		// Don't throw - this is best effort
	}
}
