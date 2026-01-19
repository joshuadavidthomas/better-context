import { v } from 'convex/values';

import { mutation } from '../_generated/server';
import { instances } from '../apiHelpers';

const instanceStateValidator = v.union(
	v.literal('unprovisioned'),
	v.literal('provisioning'),
	v.literal('stopped'),
	v.literal('starting'),
	v.literal('running'),
	v.literal('stopping'),
	v.literal('updating'),
	v.literal('error')
);

export const create = mutation({
	args: { clerkId: v.string() },
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('instances')
			.withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
			.first();

		if (existing) {
			return existing._id;
		}

		return await ctx.db.insert('instances', {
			clerkId: args.clerkId,
			state: 'unprovisioned',
			createdAt: Date.now()
		});
	}
});

export const updateState = mutation({
	args: {
		instanceId: v.id('instances'),
		state: instanceStateValidator
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.instanceId, { state: args.state });
	}
});

export const setProvisioned = mutation({
	args: {
		instanceId: v.id('instances'),
		sandboxId: v.string(),
		btcaVersion: v.optional(v.string()),
		opencodeVersion: v.optional(v.string()),
		storageUsedBytes: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const patch: {
			sandboxId: string;
			state: 'stopped';
			provisionedAt: number;
			btcaVersion?: string;
			opencodeVersion?: string;
			storageUsedBytes?: number;
		} = {
			sandboxId: args.sandboxId,
			state: 'stopped',
			provisionedAt: Date.now()
		};

		if (args.btcaVersion !== undefined) {
			patch.btcaVersion = args.btcaVersion;
		}

		if (args.opencodeVersion !== undefined) {
			patch.opencodeVersion = args.opencodeVersion;
		}

		if (args.storageUsedBytes !== undefined) {
			patch.storageUsedBytes = args.storageUsedBytes;
		}

		await ctx.db.patch(args.instanceId, patch);
	}
});

export const setServerUrl = mutation({
	args: {
		instanceId: v.id('instances'),
		serverUrl: v.string()
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.instanceId, { serverUrl: args.serverUrl });
	}
});

export const setError = mutation({
	args: {
		instanceId: v.id('instances'),
		errorMessage: v.string()
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.instanceId, {
			state: 'error',
			errorMessage: args.errorMessage
		});
	}
});

export const setVersions = mutation({
	args: {
		instanceId: v.id('instances'),
		btcaVersion: v.optional(v.string()),
		opencodeVersion: v.optional(v.string()),
		updateAvailable: v.optional(v.boolean()),
		lastVersionCheck: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const patch: {
			btcaVersion?: string;
			opencodeVersion?: string;
			updateAvailable?: boolean;
			lastVersionCheck: number;
		} = {
			lastVersionCheck: args.lastVersionCheck ?? Date.now()
		};

		if (args.btcaVersion !== undefined) {
			patch.btcaVersion = args.btcaVersion;
		}

		if (args.opencodeVersion !== undefined) {
			patch.opencodeVersion = args.opencodeVersion;
		}

		if (args.updateAvailable !== undefined) {
			patch.updateAvailable = args.updateAvailable;
		}

		await ctx.db.patch(args.instanceId, patch);
	}
});

export const touchActivity = mutation({
	args: { instanceId: v.id('instances') },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.instanceId, { lastActiveAt: Date.now() });
	}
});

export const updateStorageUsed = mutation({
	args: {
		instanceId: v.id('instances'),
		storageUsedBytes: v.number()
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.instanceId, { storageUsedBytes: args.storageUsedBytes });
	}
});

export const upsertCachedResources = mutation({
	args: {
		instanceId: v.id('instances'),
		resources: v.array(
			v.object({
				name: v.string(),
				url: v.string(),
				branch: v.string(),
				sizeBytes: v.optional(v.number())
			})
		)
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('cachedResources')
			.withIndex('by_instance', (q) => q.eq('instanceId', args.instanceId))
			.collect();

		const existingByName = new Map(existing.map((r) => [r.name, r]));
		const now = Date.now();

		for (const resource of args.resources) {
			const existingResource = existingByName.get(resource.name);
			if (existingResource) {
				await ctx.db.patch(existingResource._id, {
					url: resource.url,
					branch: resource.branch,
					sizeBytes: resource.sizeBytes,
					lastUsedAt: now
				});
			} else {
				await ctx.db.insert('cachedResources', {
					instanceId: args.instanceId,
					name: resource.name,
					url: resource.url,
					branch: resource.branch,
					sizeBytes: resource.sizeBytes,
					cachedAt: now,
					lastUsedAt: now
				});
			}
		}
	}
});

export const scheduleSyncSandboxStatus = mutation({
	args: { instanceId: v.id('instances') },
	handler: async (ctx, args) => {
		await ctx.scheduler.runAfter(0, instances.internalActions.syncSandboxStatus, {
			instanceId: args.instanceId
		});
	}
});

export const handleSandboxStopped = mutation({
	args: { sandboxId: v.string() },
	handler: async (ctx, args) => {
		const instance = await ctx.db
			.query('instances')
			.withIndex('by_sandbox_id', (q) => q.eq('sandboxId', args.sandboxId))
			.first();

		if (!instance) {
			return { updated: false, reason: 'instance_not_found' };
		}

		if (instance.state === 'stopped') {
			return { updated: false, reason: 'already_stopped' };
		}

		await ctx.db.patch(instance._id, {
			state: 'stopped',
			serverUrl: ''
		});

		return { updated: true, instanceId: instance._id };
	}
});

export const handleSandboxStarted = mutation({
	args: { sandboxId: v.string() },
	handler: async (ctx, args) => {
		const instance = await ctx.db
			.query('instances')
			.withIndex('by_sandbox_id', (q) => q.eq('sandboxId', args.sandboxId))
			.first();

		if (!instance) {
			return { updated: false, reason: 'instance_not_found' };
		}

		if (instance.state === 'running' || instance.state === 'starting') {
			return { updated: false, reason: 'already_running_or_starting' };
		}

		await ctx.db.patch(instance._id, {
			state: 'starting'
		});

		return { updated: true, instanceId: instance._id };
	}
});
