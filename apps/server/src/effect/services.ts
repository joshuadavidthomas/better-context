import { Effect, ServiceMap } from 'effect';
import type { AgentService as AgentServiceShape } from '../agent/service.ts';
import type { CollectionsService as CollectionsServiceShape } from '../collections/service.ts';
import { getCollectionKey } from '../collections/types.ts';
import type { ConfigService as ConfigServiceShape } from '../config/index.ts';
import type { ResourceDefinition } from '../resources/schema.ts';

export class ConfigService extends ServiceMap.Service<ConfigService, ConfigServiceShape>()(
	'btca-server/effect/ConfigService'
) {}

export class CollectionsService extends ServiceMap.Service<
	CollectionsService,
	CollectionsServiceShape
>()('btca-server/effect/CollectionsService') {}

export class AgentService extends ServiceMap.Service<AgentService, AgentServiceShape>()(
	'btca-server/effect/AgentService'
) {}

const configService = Effect.service(ConfigService);
const collectionsService = Effect.service(CollectionsService);
const agentService = Effect.service(AgentService);

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

export const getResourcesSnapshot: Effect.Effect<ResourcesSnapshot, never, ConfigService> =
	Effect.map(configService, (config) => ({
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
	}));

export const getDefaultResourceNames: Effect.Effect<string[], never, ConfigService> = Effect.map(
	configService,
	(config) => config.resources.map((resource) => resource.name)
);

export const reloadConfig: Effect.Effect<void, unknown, ConfigService> = Effect.flatMap(
	configService,
	(config) => config.reloadEffect()
);

export const listProviders: Effect.Effect<
	Awaited<ReturnType<AgentServiceShape['listProviders']>>,
	unknown,
	AgentService
> = Effect.flatMap(agentService, (agent) => agent.listProvidersEffect());

export const loadCollection = (args: {
	resourceNames: readonly string[];
	quiet?: boolean;
}): Effect.Effect<
	Awaited<ReturnType<CollectionsServiceShape['load']>>,
	unknown,
	CollectionsService
> => Effect.flatMap(collectionsService, (collections) => collections.loadEffect(args));

export const askQuestion = (args: {
	collection: Awaited<ReturnType<CollectionsServiceShape['load']>>;
	question: string;
}): Effect.Effect<Awaited<ReturnType<AgentServiceShape['ask']>>, unknown, AgentService> =>
	Effect.flatMap(agentService, (agent) => agent.askEffect(args));

export const askQuestionStream = (args: {
	collection: Awaited<ReturnType<CollectionsServiceShape['load']>>;
	question: string;
}): Effect.Effect<Awaited<ReturnType<AgentServiceShape['askStream']>>, unknown, AgentService> =>
	Effect.flatMap(agentService, (agent) => agent.askStreamEffect(args));

export const updateModelConfig = (args: {
	provider: string;
	model: string;
	providerOptions?: Parameters<ConfigServiceShape['updateModel']>[2];
}): Effect.Effect<Awaited<ReturnType<ConfigServiceShape['updateModel']>>, unknown, ConfigService> =>
	Effect.flatMap(configService, (config) =>
		config.updateModelEffect(args.provider, args.model, args.providerOptions)
	);

export const addConfigResource = (
	resource: ResourceDefinition
): Effect.Effect<ResourceDefinition, unknown, ConfigService> =>
	Effect.flatMap(configService, (config) => config.addResourceEffect(resource));

export const removeConfigResource = (name: string): Effect.Effect<void, unknown, ConfigService> =>
	Effect.flatMap(configService, (config) => config.removeResourceEffect(name));

export const clearConfigResources: Effect.Effect<
	Awaited<ReturnType<ConfigServiceShape['clearResources']>>,
	unknown,
	ConfigService
> = Effect.flatMap(configService, (config) => config.clearResourcesEffect());

export const loadedResourceCollectionKey = (resourceNames: readonly string[]) =>
	getCollectionKey(resourceNames);
