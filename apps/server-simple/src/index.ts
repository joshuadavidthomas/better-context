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

const QuestionRequestSchema = z.object({
	question: z.string(),
	resources: z.array(z.string()).optional(),
	quiet: z.boolean().optional(),
	stream: z.boolean().optional()
});

type QuestionRequest = z.infer<typeof QuestionRequestSchema>;

class RequestError extends Error {
	readonly _tag = 'CollectionError';

	constructor(message: string, cause?: unknown) {
		super(message, cause ? { cause } : undefined);
	}
}

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json',
			...headers
		}
	});

const errorToJsonResponse = (error: unknown) => {
	const tag = getErrorTag(error);
	const message = getErrorMessage(error);
	const status = tag === 'CollectionError' || tag === 'ResourceError' ? 400 : 500;
	return json({ error: message, tag }, status);
};

const decodeQuestionRequest = (input: unknown): QuestionRequest => {
	const parsed = QuestionRequestSchema.safeParse(input);
	if (!parsed.success) throw new RequestError('Invalid request body', parsed.error);
	return parsed.data;
};

const start = async () => {
	Metrics.info("server.starting", { port: 8080 });

	const config = await Config.load();
	Metrics.info("config.ready", {
		provider: config.provider,
		model: config.model,
		resources: config.resources.map((r) => r.name),
		resourcesDirectory: config.resourcesDirectory,
		collectionsDirectory: config.collectionsDirectory
	});

	const resources = Resources.create(config);
	const collections = Collections.create({ config, resources });
	const agent = Agent.create(config);

	Bun.serve({
		port: 8080,
		fetch: (req) => {
			const requestId = crypto.randomUUID();
			return Context.run({ requestId, txDepth: 0 }, async () => {
				const url = new URL(req.url);
				Metrics.info("http.request", { method: req.method, path: url.pathname });

				let response: Response = new Response("Internal Server Error", { status: 500 });
				try {
					if (req.method === "GET" && url.pathname === "/") {
						response = json({ ok: true, service: "btca-server" });
						return response;
					}

					if (req.method === "POST" && url.pathname === "/question") {
						let body: unknown;
						try {
							body = await req.json();
						} catch (cause) {
							throw new RequestError("Failed to parse request JSON", cause);
						}

						const decoded = decodeQuestionRequest(body);
						const resourceNames =
							decoded.resources && decoded.resources.length > 0
								? decoded.resources
								: config.resources.map((r) => r.name);

						const collectionKey = getCollectionKey(resourceNames);
						Metrics.info("question.received", {
							stream: decoded.stream === true,
							quiet: decoded.quiet ?? false,
							questionLength: decoded.question.length,
							resources: resourceNames,
							collectionKey
						});

						const collection = await collections.load({ resourceNames, quiet: decoded.quiet });
						Metrics.info("collection.ready", { collectionKey, path: collection.path });

						if (decoded.stream === true) {
							const { stream: eventStream, model } = await agent.askStream({
								collection,
								question: decoded.question
							});

							const meta = {
								type: "meta",
								model,
								resources: resourceNames,
								collection: {
									key: collectionKey,
									path: collection.path
								}
							} satisfies BtcaStreamMetaEvent;

							Metrics.info("question.stream.start", { collectionKey });
							const stream = StreamService.createSseStream({ meta, eventStream });

							response = new Response(stream, {
								headers: {
									"content-type": "text/event-stream",
									"cache-control": "no-cache",
									connection: "keep-alive"
								}
							});
							return response;
						}

						const result = await agent.ask({ collection, question: decoded.question });
						Metrics.info("question.done", {
							collectionKey,
							answerLength: result.answer.length,
							model: result.model
						});

						response = json({
							answer: result.answer,
							model: result.model,
							resources: resourceNames,
							collection: { key: collectionKey, path: collection.path }
						});
						return response;
					}

					response = new Response("Not Found", { status: 404 });
					return response;
				} catch (cause) {
					Metrics.error("http.error", { error: Metrics.errorInfo(cause) });
					response = errorToJsonResponse(cause);
					return response;
				} finally {
					Metrics.info("http.response", {
						path: url.pathname,
						status: response?.status
					});
				}
			});
		}
	});
};

await start();
