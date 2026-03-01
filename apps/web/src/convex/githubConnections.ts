import { v } from 'convex/values';

import { internalMutation, internalQuery, query } from './_generated/server';
import { getAuthenticatedInstanceResult, unwrapAuthResult } from './authHelpers';

const githubConnectionValidator = v.object({
	_id: v.id('githubConnections'),
	_creationTime: v.number(),
	instanceId: v.id('instances'),
	clerkUserId: v.string(),
	githubUserId: v.optional(v.number()),
	githubLogin: v.optional(v.string()),
	scopes: v.array(v.string()),
	status: v.union(v.literal('connected'), v.literal('missing_scope'), v.literal('disconnected')),
	connectedAt: v.optional(v.number()),
	lastValidatedAt: v.number()
});

export const getMyConnection = query({
	args: {},
	returns: v.union(v.null(), githubConnectionValidator),
	handler: async (ctx) => {
		const instance = await unwrapAuthResult(await getAuthenticatedInstanceResult(ctx));
		return await ctx.db
			.query('githubConnections')
			.withIndex('by_instance', (q) => q.eq('instanceId', instance._id))
			.first();
	}
});

export const getByInstanceId = internalQuery({
	args: { instanceId: v.id('instances') },
	returns: v.union(v.null(), githubConnectionValidator),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('githubConnections')
			.withIndex('by_instance', (q) => q.eq('instanceId', args.instanceId))
			.first();
	}
});

export const upsertForInstance = internalMutation({
	args: {
		instanceId: v.id('instances'),
		clerkUserId: v.string(),
		githubUserId: v.optional(v.number()),
		githubLogin: v.optional(v.string()),
		scopes: v.array(v.string()),
		status: v.union(v.literal('connected'), v.literal('missing_scope'), v.literal('disconnected')),
		connectedAt: v.optional(v.number())
	},
	returns: v.id('githubConnections'),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('githubConnections')
			.withIndex('by_instance', (q) => q.eq('instanceId', args.instanceId))
			.first();

		const patch = {
			clerkUserId: args.clerkUserId,
			githubUserId: args.githubUserId,
			githubLogin: args.githubLogin,
			scopes: args.scopes,
			status: args.status,
			connectedAt: args.connectedAt,
			lastValidatedAt: Date.now()
		};

		if (existing) {
			await ctx.db.patch(existing._id, patch);
			return existing._id;
		}

		return await ctx.db.insert('githubConnections', {
			instanceId: args.instanceId,
			...patch
		});
	}
});
