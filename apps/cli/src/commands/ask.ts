import type { BtcaStreamEvent } from 'btca-server/stream/types';
import { Effect } from 'effect';
import { withServerEffect } from '../server/manager.ts';
import {
	createClient,
	getConfig,
	getResources,
	askQuestionStream,
	BtcaError
} from '../client/index.ts';
import { parseSSEStream } from '../client/stream.ts';
import {
	extractMentionTokens,
	isGitUrlReference,
	isNpmReference,
	resolveConfiguredResourceName,
	stripResolvedMentionTokens
} from '../lib/resource-references.ts';
import { setTelemetryContext, trackTelemetryEvent } from '../lib/telemetry.ts';

/**
 * Format an error for display, including hint if available.
 */
function getErrorDisplayDetails(error: unknown): { message: string; hint?: string } {
	const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
		typeof value === 'object' && value !== null;
	const readStringField = (value: unknown, field: 'message' | 'hint') => {
		if (!isObjectRecord(value) || !(field in value)) return undefined;
		const candidate = value[field];
		return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
	};
	const readCause = (value: unknown) => {
		if (!isObjectRecord(value) || !('cause' in value)) return undefined;
		return value.cause;
	};
	const isWrapperMessage = (message?: string) =>
		Boolean(
			message &&
			(message.startsWith('Unhandled exception:') ||
				message.endsWith('handler threw') ||
				message.endsWith('callback threw'))
		);
	const normalizeMessage = (message: string) => {
		if (!message.startsWith('Unhandled exception:')) return message;
		const stripped = message.slice('Unhandled exception:'.length).trim();
		return stripped.length > 0 ? stripped : message;
	};

	const chain: unknown[] = [];
	const visited = new Set<unknown>();
	let current: unknown = error;
	let depth = 0;
	while (current !== undefined && depth < 12 && !visited.has(current)) {
		chain.push(current);
		visited.add(current);
		const cause = readCause(current);
		if (cause === undefined) break;
		current = cause;
		depth += 1;
	}

	let message: string | undefined;
	let hint: string | undefined;

	for (const entry of chain) {
		const entryMessage = readStringField(entry, 'message');
		if (!message && entryMessage && !isWrapperMessage(entryMessage)) {
			message = entryMessage;
		}
		const entryHint = readStringField(entry, 'hint');
		if (!hint && entryHint) hint = entryHint;
	}

	if (!message) {
		for (const entry of chain) {
			const entryMessage = readStringField(entry, 'message');
			if (entryMessage) {
				message = normalizeMessage(entryMessage);
				break;
			}
		}
	}

	if (!message) {
		message = error instanceof Error ? error.message : String(error);
	}

	return { message, hint };
}

function formatError(error: unknown): string {
	const details =
		error instanceof BtcaError
			? { message: error.message, hint: error.hint }
			: getErrorDisplayDetails(error);
	let output = `Error: ${details.message}`;
	if (details.hint) {
		output += `\n\nHint: ${details.hint}`;
	}
	return output;
}

export function streamErrorToBtcaError(message: string, tag?: string, hint?: string): BtcaError {
	const derivedHint =
		hint ??
		(tag === 'ProviderNotAuthenticatedError' ||
		message === 'Unhandled exception: Provider "opencode" is not authenticated.'
			? 'run btca connect to authenticate and pick a model.'
			: undefined);
	return new BtcaError(message, { hint: derivedHint, tag });
}

type AvailableResource = { name: string };

function normalizeResourceNames(
	inputs: string[],
	available: AvailableResource[]
): { names: string[]; invalid: string[] } {
	const resolved: string[] = [];
	const invalid: string[] = [];

	for (const input of inputs) {
		const resolvedName = resolveConfiguredResourceName(input, available);
		if (resolvedName) resolved.push(resolvedName);
		else invalid.push(input);
	}

	return { names: [...new Set(resolved)], invalid };
}
type SignalEvent = 'SIGINT' | 'SIGTERM' | 'exit';
type ForwardedSignal = 'SIGINT' | 'SIGTERM';
type SignalProcess = {
	pid: number;
	once: (event: SignalEvent, listener: () => void) => void;
	off: (event: SignalEvent, listener: () => void) => void;
	kill: (pid: number, signal: ForwardedSignal) => boolean;
	exit: (code?: number) => void;
};

export function registerSignalCleanup(stopServer: () => void, proc: SignalProcess = process) {
	let didCleanup = false;
	const cleanup = () => {
		if (didCleanup) return;
		didCleanup = true;
		try {
			stopServer();
		} catch {
			// ignore cleanup errors
		}
	};
	const forwardSignal = (signal: ForwardedSignal) => {
		proc.off('SIGINT', onSigint);
		proc.off('SIGTERM', onSigterm);
		proc.off('exit', cleanup);
		cleanup();
		try {
			proc.kill(proc.pid, signal);
		} catch {
			proc.exit(signal === 'SIGINT' ? 130 : 143);
		}
	};
	const onSigint = () => forwardSignal('SIGINT');
	const onSigterm = () => forwardSignal('SIGTERM');
	proc.once('SIGINT', onSigint);
	proc.once('SIGTERM', onSigterm);
	proc.once('exit', cleanup);
	return () => {
		proc.off('SIGINT', onSigint);
		proc.off('SIGTERM', onSigterm);
		proc.off('exit', cleanup);
		cleanup();
	};
}

export const runAskCommand = async (args: {
	question: string;
	resource?: string[];
	thinking?: boolean;
	tools?: boolean;
	subAgent?: boolean;
	globalOpts?: { server?: string; port?: number };
}) => {
	const commandName = 'ask';
	const showThinking = args.subAgent ? false : (args.thinking ?? true);
	const showTools = args.subAgent ? false : (args.tools ?? true);
	const startedAt = Date.now();
	let outputChars = 0;

	const rawArgs = process.argv;
	if (rawArgs.includes('-t') || rawArgs.includes('--tech')) {
		throw new BtcaError('The -t/--tech flag has been deprecated.', {
			hint: 'Use -r/--resource instead: btca ask -r <resource> -q "your question". You can specify multiple resources: btca ask -r svelte -r effect -q "...".'
		});
	}

	try {
		await Effect.runPromise(
			withServerEffect(
				{
					serverUrl: args.globalOpts?.server,
					port: args.globalOpts?.port,
					quiet: true
				},
				(server) =>
					Effect.tryPromise(async () => {
						const teardownSignalCleanup = registerSignalCleanup(() => server.stop());
						try {
							const client = createClient(server.url);
							const [config, resourcesResult] = await Promise.all([
								getConfig(client),
								getResources(client)
							]);
							setTelemetryContext({ provider: config.provider, model: config.model });
							await trackTelemetryEvent({
								event: 'cli_started',
								properties: { command: commandName, mode: 'ask' }
							});
							await trackTelemetryEvent({
								event: 'cli_ask_started',
								properties: { command: commandName, mode: 'ask' }
							});

							const questionText = args.question;
							const cliResources = args.resource ?? [];
							const mentionedResources = extractMentionTokens(questionText);
							const hasExplicitResources = cliResources.length > 0;
							const { resources } = resourcesResult;
							const mentionResolution = normalizeResourceNames(mentionedResources, resources);
							const explicitResolution = normalizeResourceNames(cliResources, resources);
							const anonymousResources: string[] = [];
							const unresolvedExplicit: string[] = [];

							for (const rawResource of cliResources) {
								if (explicitResolution.invalid.includes(rawResource)) {
									if (isGitUrlReference(rawResource) || isNpmReference(rawResource)) {
										anonymousResources.push(rawResource);
									} else {
										unresolvedExplicit.push(rawResource);
									}
								}
							}

							if (unresolvedExplicit.length > 0) {
								const available = resources.map((resource) => resource.name);
								throw new BtcaError(
									[
										'Unknown resources:',
										...unresolvedExplicit.map((resourceName) => `  - ${resourceName}`),
										available.length > 0
											? `Available resources: ${available.join(', ')}`
											: 'No resources are configured yet.'
									].join('\n'),
									{
										hint: 'Use a configured resource name, a valid HTTPS Git URL, or an npm reference (npm:<package> or npmjs URL).'
									}
								);
							}

							const normalized = {
								names: [
									...new Set([
										...explicitResolution.names,
										...anonymousResources,
										...mentionResolution.names
									])
								]
							};

							const resourceNames: string[] = hasExplicitResources
								? normalized.names
								: mentionResolution.names.length > 0
									? mentionResolution.names
									: resources.map((r) => r.name);

							if (resourceNames.length === 0) {
								throw new BtcaError('No resources configured.', {
									hint: 'Add resources with "btca add" or check "btca resources".'
								});
							}

							const cleanedQuery = stripResolvedMentionTokens(questionText, mentionResolution.names);
							console.log('loading resources...');

							const response = await askQuestionStream(server.url, {
								question: cleanedQuery,
								resources: resourceNames,
								quiet: true
							});

							let receivedMeta = false;
							let inReasoning = false;
							let hasText = false;

							for await (const event of parseSSEStream(response)) {
								handleStreamEvent(event, {
									onMeta: () => {
										if (!receivedMeta) {
											console.log('creating collection...\n');
											receivedMeta = true;
										}
									},
									onReasoningDelta: (delta) => {
										if (!showThinking) return;
										if (!inReasoning) {
											process.stdout.write('<thinking>\n');
											inReasoning = true;
										}
										process.stdout.write(delta);
									},
									onTextDelta: (delta) => {
										if (inReasoning) {
											process.stdout.write('\n</thinking>\n\n');
											inReasoning = false;
										}
										hasText = true;
										outputChars += delta.length;
										process.stdout.write(delta);
									},
									onToolCall: (tool) => {
										if (inReasoning) {
											process.stdout.write('\n</thinking>\n\n');
											inReasoning = false;
										}
										if (!showTools) return;
										if (hasText) {
											process.stdout.write('\n');
										}
										console.log(`[${tool}]`);
									},
									onError: (message, tag, hint) => {
										throw streamErrorToBtcaError(message, tag, hint);
									}
								});
							}

							if (inReasoning) {
								process.stdout.write('\n</thinking>\n');
							}

							console.log('\n');
						} finally {
							teardownSignalCleanup();
						}
					})
			)
		);
		const durationMs = Date.now() - startedAt;
		await trackTelemetryEvent({
			event: 'cli_ask_completed',
			properties: {
				command: commandName,
				mode: 'ask',
				durationMs,
				outputChars,
				exitCode: 0
			}
		});
		return;
	} catch (error) {
		const durationMs = Date.now() - startedAt;
		const errorName = error instanceof Error ? error.name : 'UnknownError';
		await trackTelemetryEvent({
			event: 'cli_ask_failed',
			properties: {
				command: commandName,
				mode: 'ask',
				durationMs,
				errorName,
				exitCode: 1
			}
		});
		throw error;
	}
};

interface StreamHandlers {
	onMeta?: () => void;
	onReasoningDelta?: (delta: string) => void;
	onTextDelta?: (delta: string) => void;
	onToolCall?: (tool: string) => void;
	onError?: (message: string, tag?: string, hint?: string) => void;
}

function handleStreamEvent(event: BtcaStreamEvent, handlers: StreamHandlers): void {
	switch (event.type) {
		case 'meta':
			handlers.onMeta?.();
			break;
		case 'reasoning.delta':
			handlers.onReasoningDelta?.(event.delta);
			break;
		case 'text.delta':
			handlers.onTextDelta?.(event.delta);
			break;
		case 'tool.updated':
			if (event.state.status === 'running') {
				handlers.onToolCall?.(event.tool);
			}
			break;
		case 'error':
			handlers.onError?.(event.message, event.tag, event.hint);
			break;
		case 'done':
			break;
	}
}
