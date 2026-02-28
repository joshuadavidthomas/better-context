/**
 * Agent Service
 * Refactored to use custom AI SDK loop instead of spawning OpenCode instances
 */
import { Effect } from 'effect';

import type { ConfigService as ConfigServiceShape } from '../config/index.ts';
import { getErrorHint, getErrorMessage, type TaggedErrorOptions } from '../errors.ts';
import { metricsError, metricsErrorInfo, metricsInfo } from '../metrics/index.ts';
import {
	getAuthenticatedProviders,
	getProviderAuthHint,
	getSupportedProviders,
	isAuthenticated
} from '../providers/index.ts';
import type { CollectionResult } from '../collections/types.ts';
import { clearVirtualCollectionMetadata } from '../collections/virtual-metadata.ts';
import { disposeVirtualFs } from '../vfs/virtual-fs.ts';
import type { AgentResult } from './types.ts';
import { runAgentLoop, streamAgentLoop, type AgentEvent } from './loop.ts';

export class AgentError extends Error {
		readonly _tag = 'AgentError';
		override readonly cause?: unknown;
		readonly hint?: string;

		constructor(args: TaggedErrorOptions) {
			super(args.message);
			this.cause = args.cause;
			this.hint = args.hint;
		}
	}

export class InvalidProviderError extends Error {
		readonly _tag = 'InvalidProviderError';
		readonly providerId: string;
		readonly availableProviders: string[];
		readonly hint: string;

		constructor(args: { providerId: string; availableProviders: string[] }) {
			super(`Invalid provider: "${args.providerId}"`);
			this.providerId = args.providerId;
			this.availableProviders = args.availableProviders;
			this.hint = `Available providers: ${args.availableProviders.join(
				', '
			)}. Update your config with a valid provider. Open an issue to request this provider: https://github.com/davis7dotsh/better-context/issues.`;
		}
	}

export class InvalidModelError extends Error {
		readonly _tag = 'InvalidModelError';
		readonly providerId: string;
		readonly modelId: string;
		readonly availableModels: string[];
		readonly hint: string;

		constructor(args: { providerId: string; modelId: string; availableModels: string[] }) {
			super(`Invalid model "${args.modelId}" for provider "${args.providerId}"`);
			this.providerId = args.providerId;
			this.modelId = args.modelId;
			this.availableModels = args.availableModels;
			const modelList =
				args.availableModels.length <= 5
					? args.availableModels.join(', ')
					: `${args.availableModels.slice(0, 5).join(', ')}... (${args.availableModels.length} total)`;
			this.hint = `Available models for ${args.providerId}: ${modelList}. Update your config with a valid model.`;
		}
	}

export class ProviderNotConnectedError extends Error {
		readonly _tag = 'ProviderNotConnectedError';
		readonly providerId: string;
		readonly connectedProviders: string[];
		readonly hint: string;

		constructor(args: { providerId: string; connectedProviders: string[] }) {
			super(`Provider "${args.providerId}" is not connected`);
			this.providerId = args.providerId;
			this.connectedProviders = args.connectedProviders;
			const baseHint = getProviderAuthHint(args.providerId);
			if (args.connectedProviders.length > 0) {
				this.hint = `${baseHint} Connected providers: ${args.connectedProviders.join(', ')}.`;
			} else {
				this.hint = `${baseHint} No providers are currently connected.`;
			}
		}
	}

export type AgentService = {
		askStream: (args: { collection: CollectionResult; question: string }) => Promise<{
			stream: AsyncIterable<AgentEvent>;
			model: { provider: string; model: string };
		}>;
		askStreamEffect: (
			args: { collection: CollectionResult; question: string }
		) => Effect.Effect<{
			stream: AsyncIterable<AgentEvent>;
			model: { provider: string; model: string };
		}, unknown>;

		ask: (args: { collection: CollectionResult; question: string }) => Promise<AgentResult>;
		askEffect: (
			args: { collection: CollectionResult; question: string }
		) => Effect.Effect<AgentResult, unknown>;

		listProviders: () => Promise<{
			all: { id: string; models: Record<string, unknown> }[];
			connected: string[];
		}>;
		listProvidersEffect: () => Effect.Effect<{
			all: { id: string; models: Record<string, unknown> }[];
			connected: string[];
		}, unknown>;
	};

export type Service = AgentService;

export const createAgentService = (config: ConfigServiceShape): AgentService => {
		const cleanupCollection = (collection: CollectionResult) =>
			Effect.promise(async () => {
				if (collection.vfsId) {
					disposeVirtualFs(collection.vfsId);
					clearVirtualCollectionMetadata(collection.vfsId);
				}
				try {
					await collection.cleanup?.();
				} catch {
					return;
				}
			});

		const ensureProviderConnected = Effect.fn(function* () {
			const isAuthed = yield* Effect.tryPromise(() => isAuthenticated(config.provider));
			const requiresAuth = config.provider !== 'opencode' && config.provider !== 'openai-compat';
			if (isAuthed || !requiresAuth) return;
			const authenticated = yield* Effect.tryPromise(() => getAuthenticatedProviders());
			yield* Effect.fail(
				new ProviderNotConnectedError({
					providerId: config.provider,
					connectedProviders: authenticated
				})
			);
		});

		/**
		 * Ask a question and stream the response using the new AI SDK loop
		 */
		const askStream: AgentService['askStream'] = async ({ collection, question }) => {
			metricsInfo('agent.ask.start', {
				provider: config.provider,
				model: config.model,
				questionLength: question.length
			});

			try {
				await Effect.runPromise(ensureProviderConnected());
			} catch (error) {
				await Effect.runPromise(cleanupCollection(collection));
				throw error;
			}

			// Create a generator that wraps the AgentLoop stream
			const eventGenerator = (async function* () {
				try {
					const stream = streamAgentLoop({
						providerId: config.provider,
						modelId: config.model,
						maxSteps: config.maxSteps,
						collectionPath: collection.path,
						vfsId: collection.vfsId,
						agentInstructions: collection.agentInstructions,
						question,
						providerOptions: config.getProviderOptions(config.provider)
					});
					for await (const event of stream) {
						yield event;
					}
				} finally {
					await Effect.runPromise(cleanupCollection(collection));
				}
			})();

			return {
				stream: eventGenerator,
				model: { provider: config.provider, model: config.model }
			};
		};

		/**
		 * Ask a question and return the complete response
		 */
		const ask: AgentService['ask'] = async ({ collection, question }) => {
			return Effect.runPromise(
				Effect.gen(function* () {
					metricsInfo('agent.ask.start', {
						provider: config.provider,
						model: config.model,
						questionLength: question.length
					});

					yield* ensureProviderConnected();

					const result = yield* Effect.tryPromise({
						try: () =>
							runAgentLoop({
								providerId: config.provider,
								modelId: config.model,
								maxSteps: config.maxSteps,
								collectionPath: collection.path,
								vfsId: collection.vfsId,
								agentInstructions: collection.agentInstructions,
								question,
								providerOptions: config.getProviderOptions(config.provider)
							}),
						catch: (cause) =>
							new AgentError({
								message: getErrorMessage(cause),
								hint:
									getErrorHint(cause) ??
									'This may be a temporary issue. Try running the command again.',
								cause
							})
					});

					metricsInfo('agent.ask.complete', {
						provider: config.provider,
						model: config.model,
						answerLength: result.answer.length,
						eventCount: result.events.length
					});

					return {
						answer: result.answer,
						model: result.model,
						events: result.events
					};
				}).pipe(
					Effect.tapError((error) =>
						Effect.sync(() => metricsError('agent.ask.error', { error: metricsErrorInfo(error) }))
					),
					Effect.ensuring(cleanupCollection(collection))
				)
			);
		};

		/**
		 * List available providers using local auth data
		 */
		const listProviders: AgentService['listProviders'] = async () => {
			return Effect.runPromise(
				Effect.gen(function* () {
					const supportedProviders = getSupportedProviders();
					const authenticatedProviders = yield* Effect.tryPromise(() =>
						getAuthenticatedProviders()
					);
					const all = supportedProviders.map((id) => ({
						id,
						models: {} as Record<string, unknown>
					}));

					return {
						all,
						connected: authenticatedProviders
					};
				})
			);
		};

		const askStreamEffect: AgentService['askStreamEffect'] = (args) =>
			Effect.tryPromise({
				try: () => askStream(args),
				catch: (cause) => cause
			});
		const askEffect: AgentService['askEffect'] = (args) =>
			Effect.tryPromise({
				try: () => ask(args),
				catch: (cause) => cause
			});
		const listProvidersEffect: AgentService['listProvidersEffect'] = () =>
			Effect.tryPromise({
				try: () => listProviders(),
				catch: (cause) => cause
			});

		return {
			askStream,
			ask,
			listProviders,
			askStreamEffect,
			askEffect,
			listProvidersEffect
		};
	};
