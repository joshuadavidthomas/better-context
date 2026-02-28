import { Effect, Cause, pipe } from 'effect';
import * as HttpApp from '@effect/platform/HttpApp';
import * as HttpRouter from '@effect/platform/HttpRouter';
import * as HttpServerRequest from '@effect/platform/HttpServerRequest';
import * as HttpServerResponse from '@effect/platform/HttpServerResponse';
import * as EffectContext from 'effect/Context';
import type * as Scope from 'effect/Scope';
import { z } from 'zod';

import { Agent } from './agent/service.ts';
import { Collections } from './collections/service.ts';
import { Config } from './config/index.ts';
import { toHttpErrorPayload } from './effect/errors.ts';
import { createServerRuntime } from './effect/runtime.ts';
import * as ServerServices from './effect/services.ts';
import { Metrics } from './metrics/index.ts';
import { ModelsDevPricing } from './pricing/models-dev.ts';
import { Resources } from './resources/service.ts';
import { GitResourceSchema, LocalResourceSchema, NpmResourceSchema } from './resources/schema.ts';
import { StreamService } from './stream/service.ts';
import type { BtcaStreamMetaEvent } from './stream/types.ts';
import {
	LIMITS,
	normalizeGitHubUrl,
	parseNpmReference,
	validateGitUrl,
	validateResourceReference
} from './validation/index.ts';
import { clearAllVirtualCollectionMetadata } from './collections/virtual-metadata.ts';
import { VirtualFs } from './vfs/virtual-fs.ts';

const DEFAULT_PORT = 8080;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
const modelsDevPricing = ModelsDevPricing.create();

const RESOURCE_NAME_REGEX = /^@?[a-zA-Z0-9][a-zA-Z0-9._-]*(\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;
const SAFE_NAME_REGEX = /^[a-zA-Z0-9._+\-/:]+$/;

const ResourceNameField = z
	.string()
	.min(1, 'Resource name cannot be empty')
	.max(LIMITS.RESOURCE_NAME_MAX)
	.regex(RESOURCE_NAME_REGEX, 'Invalid resource name format')
	.refine((name) => !name.includes('..'), 'Resource name must not contain ".."')
	.refine((name) => !name.includes('//'), 'Resource name must not contain "//"')
	.refine((name) => !name.endsWith('/'), 'Resource name must not end with "/"');

const ResourceReferenceField = z.string().superRefine((value, ctx) => {
	const result = validateResourceReference(value);
	if (!result.valid) {
		ctx.addIssue({
			code: 'custom',
			message: result.error
		});
	}
});

const normalizeQuestionResourceReference = (reference: string): string => {
	const npmReference = parseNpmReference(reference);
	if (npmReference) return npmReference.normalizedReference;
	const gitUrlResult = validateGitUrl(reference);
	if (gitUrlResult.valid) return gitUrlResult.value;
	return reference;
};

const QuestionRequestSchema = z.object({
	question: z
		.string()
		.min(1, 'Question cannot be empty')
		.max(
			LIMITS.QUESTION_MAX,
			`Question too long (max ${LIMITS.QUESTION_MAX.toLocaleString()} chars). This includes conversation history - try starting a new thread or clearing the chat.`
		),
	resources: z
		.array(ResourceReferenceField)
		.max(
			LIMITS.MAX_RESOURCES_PER_REQUEST,
			`Too many resources (max ${LIMITS.MAX_RESOURCES_PER_REQUEST})`
		)
		.optional(),
	quiet: z.boolean().optional()
});

const UpdateModelRequestSchema = z.object({
	provider: z
		.string()
		.min(1, 'Provider name cannot be empty')
		.max(LIMITS.PROVIDER_NAME_MAX)
		.regex(SAFE_NAME_REGEX, 'Invalid provider name format'),
	model: z
		.string()
		.min(1, 'Model name cannot be empty')
		.max(LIMITS.MODEL_NAME_MAX)
		.regex(SAFE_NAME_REGEX, 'Invalid model name format'),
	providerOptions: z
		.object({
			baseURL: z.string().optional(),
			name: z.string().optional()
		})
		.optional()
});

const AddGitResourceRequestSchema = z.object({
	type: z.literal('git'),
	name: GitResourceSchema.shape.name,
	url: GitResourceSchema.shape.url,
	branch: GitResourceSchema.shape.branch.optional().default('main'),
	searchPath: GitResourceSchema.shape.searchPath,
	searchPaths: GitResourceSchema.shape.searchPaths,
	specialNotes: GitResourceSchema.shape.specialNotes
});

const isWsl = () =>
	process.platform === 'linux' &&
	(Boolean(process.env.WSL_DISTRO_NAME) ||
		Boolean(process.env.WSL_INTEROP) ||
		Boolean(process.env.WSLENV));

const normalizeWslPath = (value: string) => {
	if (!isWsl()) return value;
	const match = value.match(/^([a-zA-Z]):\\(.*)$/);
	if (!match) return value;
	const drive = match[1]!.toLowerCase();
	const rest = match[2]!.replace(/\\/g, '/');
	return `/mnt/${drive}/${rest}`;
};

const LocalPathRequestSchema = z.preprocess(
	(value) => (typeof value === 'string' ? normalizeWslPath(value) : value),
	LocalResourceSchema.shape.path
) as z.ZodType<string>;

const AddLocalResourceRequestSchema = z.object({
	type: z.literal('local'),
	name: LocalResourceSchema.shape.name,
	path: LocalPathRequestSchema,
	specialNotes: LocalResourceSchema.shape.specialNotes
});

const AddNpmResourceRequestSchema = z.object({
	type: z.literal('npm'),
	name: NpmResourceSchema.shape.name,
	package: NpmResourceSchema.shape.package,
	version: NpmResourceSchema.shape.version,
	specialNotes: NpmResourceSchema.shape.specialNotes
});

const AddResourceRequestSchema = z.discriminatedUnion('type', [
	AddGitResourceRequestSchema,
	AddLocalResourceRequestSchema,
	AddNpmResourceRequestSchema
]);

const RemoveResourceRequestSchema = z.object({
	name: ResourceNameField
});

class RequestError extends Error {
	readonly _tag = 'RequestError';

	constructor(message: string, cause?: unknown) {
		super(message, cause ? { cause } : undefined);
	}
}

const decodeJson = <T>(
	request: HttpServerRequest.HttpServerRequest,
	schema: z.ZodType<T>
): Effect.Effect<T, RequestError> =>
	Effect.gen(function* () {
		const body = yield* Effect.mapError(request.json, (cause) => {
			return new RequestError('Failed to parse request JSON', cause);
		});
		const parsed = schema.safeParse(body);
		if (!parsed.success) {
			return yield* Effect.fail(new RequestError('Invalid request body', parsed.error));
		}
		return parsed.data;
	});

const getRequest = Effect.contextWith((context) =>
	EffectContext.get(context, HttpServerRequest.HttpServerRequest)
);

const createApp = (deps: {
	config: Config.Service;
	resources: Resources.Service;
	collections: Collections.Service;
	agent: Agent.Service;
}) => {
	const { config, collections, agent } = deps;

	const routes = pipe(
		HttpRouter.empty,
		HttpRouter.get(
			'/',
			HttpServerResponse.unsafeJson({
				ok: true,
				service: 'btca-server',
				version: '0.0.1'
			})
		),
		HttpRouter.get(
			'/config',
			Effect.map(ServerServices.getConfigSnapshot, (snapshot) =>
				HttpServerResponse.unsafeJson(snapshot)
			)
		),
		HttpRouter.get(
			'/resources',
			Effect.map(ServerServices.getResourcesSnapshot, (snapshot) =>
				HttpServerResponse.unsafeJson(snapshot)
			)
		),
		HttpRouter.get(
			'/providers',
			Effect.gen(function* () {
				const providers = yield* ServerServices.listProviders;
				return HttpServerResponse.unsafeJson(providers);
			})
		),
		HttpRouter.post(
			'/reload-config',
			Effect.gen(function* () {
				yield* ServerServices.reloadConfig;
				const resources = yield* ServerServices.getDefaultResourceNames;
				return HttpServerResponse.unsafeJson({
					ok: true,
					resources
				});
			})
		),
		HttpRouter.post(
			'/question',
			Effect.gen(function* () {
				const request = yield* getRequest;
				const decoded = yield* decodeJson(request, QuestionRequestSchema);
				const resourceNames = Array.from(
					decoded.resources && decoded.resources.length > 0
						? Array.from(new Set(decoded.resources.map(normalizeQuestionResourceReference)))
						: yield* ServerServices.getDefaultResourceNames
				);

				const collectionKey = ServerServices.loadedResourceCollectionKey(resourceNames);
				Metrics.info('question.received', {
					stream: false,
					quiet: decoded.quiet ?? false,
					questionLength: decoded.question.length,
					resources: resourceNames,
					collectionKey
				});

				const collection = yield* ServerServices.loadCollection({
					resourceNames,
					quiet: decoded.quiet
				});
				Metrics.info('collection.ready', { collectionKey, path: collection.path });

				const result = yield* ServerServices.askQuestion({
					collection,
					question: decoded.question
				});
				Metrics.info('question.done', {
					collectionKey,
					answerLength: result.answer.length,
					model: result.model
				});

				return HttpServerResponse.unsafeJson({
					answer: result.answer,
					model: result.model,
					resources: resourceNames,
					collection: { key: collectionKey, path: collection.path }
				});
			})
		),
		HttpRouter.post(
			'/question/stream',
			Effect.gen(function* () {
				const request = yield* getRequest;
				const requestStartMs = performance.now();
				const decoded = yield* decodeJson(request, QuestionRequestSchema);
				const resourceNames = Array.from(
					decoded.resources && decoded.resources.length > 0
						? Array.from(new Set(decoded.resources.map(normalizeQuestionResourceReference)))
						: yield* ServerServices.getDefaultResourceNames
				);

				const collectionKey = ServerServices.loadedResourceCollectionKey(resourceNames);
				Metrics.info('question.received', {
					stream: true,
					quiet: decoded.quiet ?? false,
					questionLength: decoded.question.length,
					resources: resourceNames,
					collectionKey
				});

				const collection = yield* ServerServices.loadCollection({
					resourceNames,
					quiet: decoded.quiet
				});
				Metrics.info('collection.ready', { collectionKey, path: collection.path });

				const { stream: eventStream, model } = yield* ServerServices.askQuestionStream({
					collection,
					question: decoded.question
				});

				const meta = {
					type: 'meta',
					model,
					resources: resourceNames,
					collection: {
						key: collectionKey,
						path: collection.path
					}
				} satisfies BtcaStreamMetaEvent;

				Metrics.info('question.stream.start', { collectionKey });
				modelsDevPricing.prefetch();
				const stream = StreamService.createSseStream({
					meta,
					eventStream,
					question: decoded.question,
					requestStartMs,
					pricing: modelsDevPricing
				});

				return HttpServerResponse.raw(
					new Response(stream, {
						headers: {
							'content-type': 'text/event-stream',
							'cache-control': 'no-cache',
							connection: 'keep-alive'
						}
					})
				);
			})
		),
		HttpRouter.put(
			'/config/model',
			Effect.gen(function* () {
				const request = yield* getRequest;
				const decoded = yield* decodeJson(request, UpdateModelRequestSchema);
				const result = yield* ServerServices.updateModelConfig({
					provider: decoded.provider,
					model: decoded.model,
					providerOptions: decoded.providerOptions
				});
				return HttpServerResponse.unsafeJson(result);
			})
		),
		HttpRouter.post(
			'/config/resources',
			Effect.gen(function* () {
				const request = yield* getRequest;
				const decoded = yield* decodeJson(request, AddResourceRequestSchema);
				if (decoded.type === 'git') {
					const normalizedUrl = normalizeGitHubUrl(decoded.url);
					const resource = {
						type: 'git' as const,
						name: decoded.name,
						url: normalizedUrl,
						branch: decoded.branch ?? 'main',
						...(decoded.searchPath && { searchPath: decoded.searchPath }),
						...(decoded.searchPaths && { searchPaths: decoded.searchPaths }),
						...(decoded.specialNotes && { specialNotes: decoded.specialNotes })
					};
					const added = yield* ServerServices.addConfigResource(resource);
					return HttpServerResponse.unsafeJson(added, { status: 201 });
				}
				if (decoded.type === 'local') {
					const resource = {
						type: 'local' as const,
						name: decoded.name,
						path: decoded.path,
						...(decoded.specialNotes && { specialNotes: decoded.specialNotes })
					};
					const added = yield* ServerServices.addConfigResource(resource);
					return HttpServerResponse.unsafeJson(added, { status: 201 });
				}
				const resource = {
					type: 'npm' as const,
					name: decoded.name,
					package: decoded.package,
					...(decoded.version ? { version: decoded.version } : {}),
					...(decoded.specialNotes ? { specialNotes: decoded.specialNotes } : {})
				};
				const added = yield* ServerServices.addConfigResource(resource);
				return HttpServerResponse.unsafeJson(added, { status: 201 });
			})
		),
		HttpRouter.del(
			'/config/resources',
			Effect.gen(function* () {
				const request = yield* getRequest;
				const decoded = yield* decodeJson(request, RemoveResourceRequestSchema);
				yield* ServerServices.removeConfigResource(decoded.name);
				return HttpServerResponse.unsafeJson({ success: true, name: decoded.name });
			})
		),
		HttpRouter.post(
			'/clear',
			Effect.gen(function* () {
				const result = yield* ServerServices.clearConfigResources;
				return HttpServerResponse.unsafeJson(result);
			})
		)
	);

	return pipe(
		routes,
		HttpRouter.provideService(ServerServices.ConfigService, config),
		HttpRouter.provideService(ServerServices.CollectionsService, collections),
		HttpRouter.provideService(ServerServices.AgentService, agent),
		HttpRouter.catchAllCause((cause) => {
			const error = Cause.squash(cause);
			Metrics.error('http.error', { error: Metrics.errorInfo(error) });
			const payload = toHttpErrorPayload(error);
			return HttpServerResponse.unsafeJson(
				{ error: payload.error, tag: payload.tag, ...(payload.hint && { hint: payload.hint }) },
				{ status: payload.status }
			);
		})
	);
};

export type AppType = {
	readonly _tag: 'effect-http-app';
};

export interface ServerInstance {
	port: number;
	url: string;
	stop: () => void;
}

export interface StartServerOptions {
	port?: number;
	quiet?: boolean;
}

export const startServer = async (options: StartServerOptions = {}): Promise<ServerInstance> => {
	if (options.quiet) {
		Metrics.setQuiet(true);
	}

	const requestedPort = options.port ?? PORT;
	Metrics.info('server.starting', { port: requestedPort });

	const config = await Config.load();
	Metrics.info('config.ready', {
		provider: config.provider,
		model: config.model,
		maxSteps: config.maxSteps,
		resources: config.resources.map((resource) => resource.name),
		resourcesDirectory: config.resourcesDirectory
	});

	const resources = Resources.create(config);
	const collections = Collections.create({ config, resources });
	const agent = Agent.create(config);
	const runtime = createServerRuntime();
	const router = createApp({ config, resources, collections, agent });
	const httpApp = await runtime.runPromise(HttpRouter.toHttpApp(router));
	const handler = HttpApp.toWebHandler(httpApp as HttpApp.Default<unknown, Scope.Scope>);

	const server = Bun.serve({
		port: requestedPort,
		fetch: (request) => handler(request),
		idleTimeout: 60
	});

	const actualPort = server.port ?? requestedPort;
	Metrics.info('server.started', { port: actualPort });

	return {
		port: actualPort,
		url: `http://localhost:${actualPort}`,
		stop: () => {
			VirtualFs.disposeAll();
			clearAllVirtualCollectionMetadata();
			server.stop();
			void runtime.dispose();
		}
	};
};

export type { BtcaStreamEvent, BtcaStreamMetaEvent } from './stream/types.ts';

if (import.meta.main) {
	const server = await startServer({ port: PORT });
	const shutdown = () => {
		Metrics.info('server.shutdown', { reason: 'signal' });
		server.stop();
		process.exit(0);
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}
