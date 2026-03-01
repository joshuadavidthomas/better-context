import { Effect } from 'effect';
import type { BtcaStreamEvent } from 'btca-server/stream/types';
import { withServerEffect } from '../server/manager.ts';
import { createClient, getConfig, getResources, askQuestionStream } from '../client/index.ts';
import { parseSSEStream } from '../client/stream.ts';
import { formatCliCommandError } from '../effect/errors.ts';
import { runCliEffect } from '../effect/runtime.ts';
import { setTelemetryContext, trackTelemetryEvent } from '../lib/telemetry.ts';

type ResourceInfo = { name: string; type: string; url?: string };

export interface ReplOptions {
	server?: string;
	port?: number;
	thinking?: boolean;
	tools?: boolean;
	subAgent?: boolean;
}

/**
 * Extract @mentions from input
 */
function extractMentions(input: string): string[] {
	const mentionRegex = /(^|[^\w@])@([A-Za-z0-9._/-]+)/g;
	const mentions: string[] = [];
	let match;
	while ((match = mentionRegex.exec(input)) !== null) {
		if (match[2]) mentions.push(match[2]);
	}
	return mentions;
}

/**
 * Remove valid @mentions from input, leaving the question
 */
function cleanInput(input: string, validResources: string[]): string {
	const validSet = new Set(validResources.map((r) => r.toLowerCase()));
	return input
		.replace(/(^|[^\w@])@([A-Za-z0-9._/-]+)/g, (match, prefix, mention) => {
			return validSet.has(mention.toLowerCase()) ? prefix : match;
		})
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Resolve resource name, case-insensitive
 */
function resolveResourceName(input: string, available: ResourceInfo[]): string | null {
	const target = input.toLowerCase();
	const direct = available.find((r) => r.name.toLowerCase() === target);
	if (direct) return direct.name;

	if (target.startsWith('@')) {
		const withoutAt = target.slice(1);
		const match = available.find((r) => r.name.toLowerCase() === withoutAt);
		return match?.name ?? null;
	}

	return null;
}

interface StreamHandlers {
	onReasoningDelta?: (delta: string) => void;
	onTextDelta?: (delta: string) => void;
	onToolCall?: (tool: string) => void;
	onError?: (message: string) => void;
}

function runReplEffect<A>(effect: Effect.Effect<A, unknown>) {
	return runCliEffect(effect);
}

function handleStreamEvent(event: BtcaStreamEvent, handlers: StreamHandlers): void {
	switch (event.type) {
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
			handlers.onError?.(event.message);
			break;
	}
}

/**
 * Simple prompt using Bun's built-in console
 */
async function prompt(message: string): Promise<string | null> {
	process.stdout.write(message);
	const reader = (
		Bun.stdin.stream() as unknown as { getReader: () => ReadableStreamDefaultReader<Uint8Array> }
	).getReader();
	const decoder = new TextDecoder();
	let input = '';

	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) return null;
			input += decoder.decode(value ?? new Uint8Array(), { stream: true });
			const newlineIndex = input.indexOf('\n');
			if (newlineIndex !== -1) {
				return input.slice(0, newlineIndex).trim();
			}
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * Launch the simple REPL mode (no TUI)
 */
export async function launchRepl(options: ReplOptions): Promise<void> {
	const showThinking = options.subAgent ? false : (options.thinking ?? true);
	const showTools = options.subAgent ? false : (options.tools ?? true);

	return runCliEffect(
		withServerEffect(
			{
				serverUrl: options.server,
				port: options.port
			},
			(server) =>
				Effect.tryPromise(async () => {
					const client = createClient(server.url);
					const [config, resourcesResult] = await Promise.all([
						getConfig(client),
						getResources(client)
					]);
					setTelemetryContext({ provider: config.provider, model: config.model });
					await trackTelemetryEvent({
						event: 'cli_started',
						properties: { command: 'btca', mode: 'repl' }
					});
					await trackTelemetryEvent({
						event: 'cli_repl_started',
						properties: { command: 'btca', mode: 'repl' }
					});
					const { resources } = resourcesResult;

					if (resources.length === 0) {
						throw new Error(
							'No resources configured. Add resources with "btca add" or check "btca resources".'
						);
					}

					console.log('btca REPL mode (--no-tui)');
					console.log(`Available resources: ${resources.map((r) => r.name).join(', ')}`);
					console.log(
						'Use @resource to specify context. Type /help for commands, /quit to exit.\n'
					);

					let sessionResources: string[] = [];

					const printHelp = () => {
						console.log(`
Commands:
  /help           Show this help message
  /resources      List available resources
  /clear          Clear session resources
  /quit, /exit    Exit the REPL

Usage:
  @resource question    Ask a question about a resource
  question              Continue with previous resource(s)

Examples:
  @svelte How do stores work?
  @react @vue Compare component lifecycles
`);
					};

					while (true) {
						const input = await prompt('btca> ');
						if (input === null) {
							console.log('\nGoodbye!');
							break;
						}

						if (!input) continue;

						if (input.startsWith('/')) {
							const cmd = input.toLowerCase();
							if (cmd === '/help') {
								printHelp();
							} else if (cmd === '/resources') {
								console.log(`Available: ${resources.map((r) => r.name).join(', ')}`);
								if (sessionResources.length > 0) {
									console.log(`Session: ${sessionResources.join(', ')}`);
								}
							} else if (cmd === '/clear') {
								sessionResources = [];
								console.log('Session resources cleared.');
							} else if (cmd === '/quit' || cmd === '/exit') {
								console.log('Goodbye!');
								break;
							} else {
								console.log(`Unknown command: ${input}. Type /help for available commands.`);
							}
							continue;
						}

						const mentions = extractMentions(input);
						const validNewResources: string[] = [];
						for (const mention of mentions) {
							const resolved = resolveResourceName(mention, resources);
							if (resolved) validNewResources.push(resolved);
						}

						if (validNewResources.length > 0) {
							sessionResources = [...new Set([...sessionResources, ...validNewResources])];
						}

						if (sessionResources.length === 0) {
							console.log('Use @resource to specify context. Example: @svelte How do stores work?');
							continue;
						}

						const question = cleanInput(input, sessionResources);
						if (!question) {
							console.log('Please enter a question after the @mention.');
							continue;
						}

						try {
							await runReplEffect(
								Effect.tryPromise(async () => {
									console.log(`[Searching: ${sessionResources.join(', ')}]\n`);
									const response = await askQuestionStream(server.url, {
										question,
										resources: sessionResources,
										quiet: true
									});

									let inReasoning = false;
									let hasText = false;
									for await (const event of parseSSEStream(response)) {
										handleStreamEvent(event, {
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
												process.stdout.write(delta);
											},
											onToolCall: (tool) => {
												if (inReasoning) {
													process.stdout.write('\n</thinking>\n\n');
													inReasoning = false;
												}
												if (!showTools) return;
												if (hasText) process.stdout.write('\n');
												console.log(`[${tool}]`);
											},
											onError: (message) => {
												console.error(`\nError: ${message}`);
											}
										});
									}

									if (inReasoning) {
										process.stdout.write('\n</thinking>\n');
									}
									console.log('\n');
								})
							);
						} catch (error) {
							console.error(formatCliCommandError(error));
						}
					}
				})
		)
	);
}
