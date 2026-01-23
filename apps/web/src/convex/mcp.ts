'use node';

import { v } from 'convex/values';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import { instances } from './apiHelpers';

const instanceActions = instances.actions;
const instanceMutations = instances.mutations;
const instanceQueries = instances.queries;

type AskResult = { ok: true; text: string } | { ok: false; error: string };

export const ask = action({
	args: {
		instanceId: v.id('instances'),
		question: v.string(),
		resources: v.array(v.string())
	},
	handler: async (ctx, args): Promise<AskResult> => {
		const { instanceId, question, resources } = args;

		const availableResources: {
			global: { name: string }[];
			custom: { name: string }[];
		} = await ctx.runQuery(api.resources.listAvailable, { instanceId });
		const allResourceNames: string[] = [
			...availableResources.global.map((r: { name: string }) => r.name),
			...availableResources.custom.map((r: { name: string }) => r.name)
		];

		const invalidResources: string[] = resources.filter(
			(r: string) => !allResourceNames.includes(r)
		);
		if (invalidResources.length > 0) {
			return {
				ok: false as const,
				error: `Invalid resources: ${invalidResources.join(', ')}. Use listResources to see available resources.`
			};
		}

		const usageCheck = await ctx.runAction(api.usage.ensureUsageAvailable, {
			instanceId,
			question,
			resources
		});

		if (!usageCheck?.ok) {
			const reason = (usageCheck as { reason?: string }).reason;
			if (reason === 'subscription_required') {
				return {
					ok: false as const,
					error: 'Subscription required. Visit Better Context to subscribe.'
				};
			}
			if (reason === 'free_limit_reached') {
				return {
					ok: false as const,
					error: 'Free message limit reached. Upgrade to Pro to continue.'
				};
			}
			return { ok: false as const, error: 'Usage limits reached.' };
		}

		const instance = await ctx.runQuery(instanceQueries.get, { id: instanceId });
		if (!instance) {
			return { ok: false as const, error: 'Instance not found' };
		}

		if (instance.state === 'error') {
			return { ok: false as const, error: 'Instance is in an error state' };
		}

		if (instance.state === 'provisioning' || instance.state === 'unprovisioned') {
			return { ok: false as const, error: 'Instance is still provisioning' };
		}

		let serverUrl = instance.serverUrl;
		if (instance.state !== 'running' || !serverUrl) {
			if (!instance.sandboxId) {
				return { ok: false as const, error: 'Instance does not have a sandbox' };
			}
			const wakeResult = await ctx.runAction(instanceActions.wake, { instanceId });
			serverUrl = wakeResult.serverUrl;
			if (!serverUrl) {
				return { ok: false as const, error: 'Failed to wake instance' };
			}
		}

		const response = await fetch(`${serverUrl}/question`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				question,
				resources,
				quiet: true
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			return { ok: false as const, error: errorText || `Server error: ${response.status}` };
		}

		const result = (await response.json()) as { text?: string };

		const usageData = usageCheck as {
			inputTokens?: number;
			sandboxUsageHours?: number;
		};

		try {
			await ctx.runAction(api.usage.finalizeUsage, {
				instanceId,
				questionTokens: usageData.inputTokens ?? 0,
				outputChars: result.text?.length ?? 0,
				reasoningChars: 0,
				resources,
				sandboxUsageHours: usageData.sandboxUsageHours ?? 0
			});
		} catch (error) {
			console.error('Failed to track usage:', error);
		}

		await ctx.runMutation(instanceMutations.touchActivity, { instanceId });

		return {
			ok: true as const,
			text: result.text ?? JSON.stringify(result)
		};
	}
});
