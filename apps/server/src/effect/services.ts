import { Effect } from 'effect';
import * as Context from 'effect/Context';
import { Agent } from '../agent/service.ts';
import { Collections } from '../collections/service.ts';
import { getCollectionKey } from '../collections/types.ts';
import { Config } from '../config/index.ts';
import type { ResourceDefinition } from '../resources/schema.ts';

export class ConfigService extends Context.Tag('btca-server/effect/ConfigService')<
	ConfigService,
	Config.Service
>() {}

export class CollectionsService extends Context.Tag(
	'btca-server/effect/CollectionsService'
)<CollectionsService, Collections.Service>() {}

export class AgentService extends Context.Tag('btca-server/effect/AgentService')<
	AgentService,
	Agent.Service
>() {}

const configService = Effect.contextWith((context: Context.Context<ConfigService>) =>
	Context.get(context, ConfigService)
);
const collectionsService = Effect.contextWith(
	(context: Context.Context<CollectionsService>) => Context.get(context, CollectionsService)
);
const agentService = Effect.contextWith((context: Context.Context<AgentService>) =>
	Context.get(context, AgentService)
);

export type ConfigSnapshot = {
	provider: string;
	model: string;
	providerTimeoutMs: number | null;
	maxSteps: number;
	resourcesDirectory: string;
	resourceCount: number;
};

export type ResourcesSnapshot = {
	resources: Array<{
		name: string;
		type: 'git' | 'local' | 'npm';
		url?: string;
		branch?: string;
		path?: string;
		package?: string;
		version?: string | null;
		searchPath?: string | null;
		searchPaths?: string[] | null;
		specialNotes?: string | null;
	}>;
};

export const getConfigSnapshot: Effect.Effect<ConfigSnapshot, never, ConfigService> = Effect.map(
	configService,
	(config) => ({
		provider: config.provider,
		model: config.model,
		providerTimeoutMs: config.providerTimeoutMs ?? null,
		maxSteps: config.maxSteps,
		resourcesDirectory: config.resourcesDirectory,
		resourceCount: config.resources.length
	})
);

export const getResourcesSnapshot: Effect.Effect<ResourcesSnapshot, never, ConfigService> = Effect.map(
	configService,
	(config) => ({
		resources: config.resources.map((resource) => {
			if (resource.type === 'git') {
				return {
					name: resource.name,
					type: resource.type,
					url: resource.url,
					branch: resource.branch,
					searchPath: resource.searchPath ?? null,
					searchPaths: resource.searchPaths ?? null,
					specialNotes: resource.specialNotes ?? null
				};
			}
			if (resource.type === 'local') {
				return {
					name: resource.name,
					type: resource.type,
					path: resource.path,
					specialNotes: resource.specialNotes ?? null
				};
			}
			return {
				name: resource.name,
				type: resource.type,
				package: resource.package,
				version: resource.version ?? null,
				specialNotes: resource.specialNotes ?? null
			};
		})
	})
);

export const getDefaultResourceNames: Effect.Effect<string[], never, ConfigService> =
	Effect.map(configService, (config) => config.resources.map((resource) => resource.name));

export const reloadConfig: Effect.Effect<void, unknown, ConfigService> = Effect.flatMap(
	configService,
	(config) => config.reloadEffect()
);

export const listProviders: Effect.Effect<
	Awaited<ReturnType<Agent.Service['listProviders']>>,
	unknown,
	AgentService
> = Effect.flatMap(agentService, (agent) => agent.listProvidersEffect());

export const loadCollection = (args: {
	resourceNames: readonly string[];
	quiet?: boolean;
}): Effect.Effect<Awaited<ReturnType<Collections.Service['load']>>, unknown, CollectionsService> =>
	Effect.flatMap(collectionsService, (collections) =>
		Effect.tryPromise(() => collections.load(args))
	);

export const askQuestion = (args: {
	collection: Awaited<ReturnType<Collections.Service['load']>>;
	question: string;
}): Effect.Effect<Awaited<ReturnType<Agent.Service['ask']>>, unknown, AgentService> =>
	Effect.flatMap(agentService, (agent) => agent.askEffect(args));

export const askQuestionStream = (args: {
	collection: Awaited<ReturnType<Collections.Service['load']>>;
	question: string;
}): Effect.Effect<Awaited<ReturnType<Agent.Service['askStream']>>, unknown, AgentService> =>
	Effect.flatMap(agentService, (agent) => agent.askStreamEffect(args));

export const updateModelConfig = (args: {
	provider: string;
	model: string;
	providerOptions?: Parameters<Config.Service['updateModel']>[2];
}): Effect.Effect<Awaited<ReturnType<Config.Service['updateModel']>>, unknown, ConfigService> =>
	Effect.flatMap(configService, (config) =>
		config.updateModelEffect(args.provider, args.model, args.providerOptions)
	);

export const addConfigResource = (
	resource: ResourceDefinition
): Effect.Effect<ResourceDefinition, unknown, ConfigService> =>
	Effect.flatMap(configService, (config) => config.addResourceEffect(resource));

export const removeConfigResource = (
	name: string
): Effect.Effect<void, unknown, ConfigService> =>
	Effect.flatMap(configService, (config) => config.removeResourceEffect(name));

export const clearConfigResources: Effect.Effect<
	Awaited<ReturnType<Config.Service['clearResources']>>,
	unknown,
	ConfigService
> = Effect.flatMap(configService, (config) => config.clearResourcesEffect());

export const loadedResourceCollectionKey = (resourceNames: readonly string[]) =>
	getCollectionKey(resourceNames);
