import { Hono } from 'hono';
import type { Context as HonoContext, Next } from 'hono';
import { z } from 'zod';

import { Agent } from './agent/service.ts';
import { Collections } from './collections/service.ts';
import { getCollectionKey } from './collections/types.ts';
import { Config } from './config/index.ts';
import { Context } from './context/index.ts';
import { getErrorMessage, getErrorTag } from './errors.ts';
import { Metrics } from './metrics/index.ts';
import { Resources } from './resources/service.ts';
import { StreamService } from './stream/service.ts';
import type { BtcaStreamMetaEvent } from './stream/types.ts';

/**
 * BTCA Server API
 *
 * Endpoints:
 *
 * GET  /                  - Health check, returns { ok, service, version }
 * GET  /config            - Returns current configuration (provider, model, directories)
 * GET  /resources         - Lists all configured resources
 * POST /question          - Ask a question (non-streaming)
 * POST /question/stream   - Ask a question (streaming SSE response)
 * POST /opencode          - Get OpenCode instance URL for a collection
 */

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PORT = 8080;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;

// ─────────────────────────────────────────────────────────────────────────────
// Request Schemas
// ─────────────────────────────────────────────────────────────────────────────

const QuestionRequestSchema = z.object({
	question: z.string(),
	resources: z.array(z.string()).optional(),
	quiet: z.boolean().optional()
});

const OpencodeRequestSchema = z.object({
	resources: z.array(z.string()).optional(),
	quiet: z.boolean().optional()
});

const UpdateModelRequestSchema = z.object({
	provider: z.string(),
	model: z.string()
});

const AddResourceRequestSchema = z.object({
	name: z.string(),
	type: z.enum(['git', 'local']),
	url: z.string().optional(),
	branch: z.string().optional(),
	path: z.string().optional(),
	searchPath: z.string().optional(),
	specialNotes: z.string().optional()
});

const RemoveResourceRequestSchema = z.object({
	name: z.string()
});

// ─────────────────────────────────────────────────────────────────────────────
// Errors & Helpers
// ─────────────────────────────────────────────────────────────────────────────

class RequestError extends Error {
	readonly _tag = 'RequestError';

	constructor(message: string, cause?: unknown) {
		super(message, cause ? { cause } : undefined);
	}
}

const decodeJson = async <T>(req: Request, schema: z.ZodType<T>): Promise<T> => {
	let body: unknown;
	try {
		body = await req.json();
	} catch (cause) {
		throw new RequestError('Failed to parse request JSON', cause);
	}

	const parsed = schema.safeParse(body);
	if (!parsed.success) throw new RequestError('Invalid request body', parsed.error);
	return parsed.data;
};

// ─────────────────────────────────────────────────────────────────────────────
// App Factory
// ─────────────────────────────────────────────────────────────────────────────

const createApp = (deps: {
	config: Config.Service;
	resources: Resources.Service;
	collections: Collections.Service;
	agent: Agent.Service;
}) => {
	const { config, collections, agent } = deps;

	const app = new Hono()
		// ─────────────────────────────────────────────────────────────────────
		// Middleware
		// ─────────────────────────────────────────────────────────────────────
		.use('*', async (c: HonoContext, next: Next) => {
			const requestId = crypto.randomUUID();
			return Context.run({ requestId, txDepth: 0 }, async () => {
				Metrics.info('http.request', { method: c.req.method, path: c.req.path });
				try {
					await next();
				} finally {
					Metrics.info('http.response', {
						path: c.req.path,
						status: c.res.status
					});
				}
			});
		})
		.onError((err: Error, c: HonoContext) => {
			Metrics.error('http.error', { error: Metrics.errorInfo(err) });
			const tag = getErrorTag(err);
			const message = getErrorMessage(err);
			const status = tag === 'CollectionError' || tag === 'ResourceError' ? 400 : 500;
			return c.json({ error: message, tag }, status);
		})

		// ─────────────────────────────────────────────────────────────────────
		// Routes
		// ─────────────────────────────────────────────────────────────────────

		// GET / - Health check
		.get('/', (c: HonoContext) => {
			return c.json({
				ok: true,
				service: 'btca-server',
				version: '0.0.1'
			});
		})

		// GET /config
		.get('/config', (c: HonoContext) => {
			return c.json({
				provider: config.provider,
				model: config.model,
				resourcesDirectory: config.resourcesDirectory,
				collectionsDirectory: config.collectionsDirectory,
				resourceCount: config.resources.length
			});
		})

		// GET /resources
		.get('/resources', (c: HonoContext) => {
			return c.json({
				resources: config.resources.map((r) => {
					if (r.type === 'git') {
						return {
							name: r.name,
							type: r.type,
							url: r.url,
							branch: r.branch,
							searchPath: r.searchPath ?? null,
							specialNotes: r.specialNotes ?? null
						};
					} else {
						return {
							name: r.name,
							type: r.type,
							path: r.path,
							specialNotes: r.specialNotes ?? null
						};
					}
				})
			});
		})

		// POST /question
		.post('/question', async (c: HonoContext) => {
			const decoded = await decodeJson(c.req.raw, QuestionRequestSchema);
			const resourceNames =
				decoded.resources && decoded.resources.length > 0
					? decoded.resources
					: config.resources.map((r) => r.name);

			const collectionKey = getCollectionKey(resourceNames);
			Metrics.info('question.received', {
				stream: false,
				quiet: decoded.quiet ?? false,
				questionLength: decoded.question.length,
				resources: resourceNames,
				collectionKey
			});

			const collection = await collections.load({ resourceNames, quiet: decoded.quiet });
			Metrics.info('collection.ready', { collectionKey, path: collection.path });

			const result = await agent.ask({ collection, question: decoded.question });
			Metrics.info('question.done', {
				collectionKey,
				answerLength: result.answer.length,
				model: result.model
			});

			return c.json({
				answer: result.answer,
				model: result.model,
				resources: resourceNames,
				collection: { key: collectionKey, path: collection.path }
			});
		})

		// POST /question/stream
		.post('/question/stream', async (c: HonoContext) => {
			const decoded = await decodeJson(c.req.raw, QuestionRequestSchema);
			const resourceNames =
				decoded.resources && decoded.resources.length > 0
					? decoded.resources
					: config.resources.map((r) => r.name);

			const collectionKey = getCollectionKey(resourceNames);
			Metrics.info('question.received', {
				stream: true,
				quiet: decoded.quiet ?? false,
				questionLength: decoded.question.length,
				resources: resourceNames,
				collectionKey
			});

			const collection = await collections.load({ resourceNames, quiet: decoded.quiet });
			Metrics.info('collection.ready', { collectionKey, path: collection.path });

			const { stream: eventStream, model } = await agent.askStream({
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
			const stream = StreamService.createSseStream({ meta, eventStream });

			return new Response(stream, {
				headers: {
					'content-type': 'text/event-stream',
					'cache-control': 'no-cache',
					connection: 'keep-alive'
				}
			});
		})

		// POST /opencode - Get OpenCode instance URL for a collection
		.post('/opencode', async (c: HonoContext) => {
			const decoded = await decodeJson(c.req.raw, OpencodeRequestSchema);
			const resourceNames =
				decoded.resources && decoded.resources.length > 0
					? decoded.resources
					: config.resources.map((r) => r.name);

			const collectionKey = getCollectionKey(resourceNames);
			Metrics.info('opencode.requested', {
				quiet: decoded.quiet ?? false,
				resources: resourceNames,
				collectionKey
			});

			const collection = await collections.load({ resourceNames, quiet: decoded.quiet });
			Metrics.info('collection.ready', { collectionKey, path: collection.path });

			const { url, model } = await agent.getOpencodeInstance({ collection });
			Metrics.info('opencode.ready', { collectionKey, url });

			return c.json({
				url,
				model,
				resources: resourceNames,
				collection: { key: collectionKey, path: collection.path }
			});
		})

		// PUT /config/model - Update model configuration
		.put('/config/model', async (c: HonoContext) => {
			const decoded = await decodeJson(c.req.raw, UpdateModelRequestSchema);
			const result = await config.updateModel(decoded.provider, decoded.model);
			return c.json(result);
		})

		// POST /config/resources - Add a new resource
		.post('/config/resources', async (c: HonoContext) => {
			const decoded = await decodeJson(c.req.raw, AddResourceRequestSchema);

			// Validate based on type
			if (decoded.type === 'git') {
				if (!decoded.url) {
					throw new RequestError('URL is required for git resources');
				}
				const resource = {
					type: 'git' as const,
					name: decoded.name,
					url: decoded.url,
					branch: decoded.branch ?? 'main',
					...(decoded.searchPath && { searchPath: decoded.searchPath }),
					...(decoded.specialNotes && { specialNotes: decoded.specialNotes })
				};
				const added = await config.addResource(resource);
				return c.json(added, 201);
			} else {
				if (!decoded.path) {
					throw new RequestError('Path is required for local resources');
				}
				const resource = {
					type: 'local' as const,
					name: decoded.name,
					path: decoded.path,
					...(decoded.specialNotes && { specialNotes: decoded.specialNotes })
				};
				const added = await config.addResource(resource);
				return c.json(added, 201);
			}
		})

		// DELETE /config/resources - Remove a resource
		.delete('/config/resources', async (c: HonoContext) => {
			const decoded = await decodeJson(c.req.raw, RemoveResourceRequestSchema);
			await config.removeResource(decoded.name);
			return c.json({ success: true, name: decoded.name });
		})

		// POST /clear - Clear all locally cloned resources
		.post('/clear', async (c: HonoContext) => {
			const result = await config.clearResources();
			return c.json(result);
		});

	return app;
};

// Export app type for Hono RPC client
// We create a dummy app with null deps just to get the type
type AppType = ReturnType<typeof createApp>;
export type { AppType };

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerInstance {
	port: number;
	url: string;
	stop: () => void;
}

export interface StartServerOptions {
	port?: number;
	quiet?: boolean;
}

/**
 * Start the btca server programmatically.
 * Returns a ServerInstance with the port, url, and stop function.
 *
 * If port is 0, a random available port will be assigned by the OS.
 */
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
		resources: config.resources.map((r) => r.name),
		resourcesDirectory: config.resourcesDirectory,
		collectionsDirectory: config.collectionsDirectory
	});

	const resources = Resources.create(config);
	const collections = Collections.create({ config, resources });
	const agent = Agent.create(config);

	const app = createApp({ config, resources, collections, agent });

	const server = Bun.serve({
		port: requestedPort,
		fetch: app.fetch
	});

	const actualPort = server.port ?? requestedPort;
	Metrics.info('server.started', { port: actualPort });

	return {
		port: actualPort,
		url: `http://localhost:${actualPort}`,
		stop: () => server.stop()
	};
};

// Auto-start when run directly (not imported)
const isMainModule = import.meta.main;
if (isMainModule) {
	await startServer({ port: PORT });
}
