import { Layer, ServiceMap, pipe } from 'effect';
import type { Agent } from '../agent/service.ts';
import type { Collections } from '../collections/service.ts';
import type { Config } from '../config/index.ts';
import { AgentService, CollectionsService, ConfigService } from './services.ts';

export type ServerLayerDependencies = {
	config: Config.Service;
	collections: Collections.Service;
	agent: Agent.Service;
};

export const makeServerLayer = (dependencies: ServerLayerDependencies) =>
	Layer.mergeAll(
		Layer.succeed(ConfigService, dependencies.config),
		Layer.succeed(CollectionsService, dependencies.collections),
		Layer.succeed(AgentService, dependencies.agent)
	);

export const makeServerServiceMap = (dependencies: ServerLayerDependencies) =>
	pipe(
		ServiceMap.empty(),
		ServiceMap.add(ConfigService, dependencies.config),
		ServiceMap.add(CollectionsService, dependencies.collections),
		ServiceMap.add(AgentService, dependencies.agent)
	);
