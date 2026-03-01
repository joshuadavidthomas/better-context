/**
 * Custom Agent Loop
 * Uses AI SDK's streamText with custom tools
 */
import { streamText, tool, stepCountIs, type ModelMessage } from 'ai';

import { getModel } from '../providers/index.ts';
import type { ProviderOptions } from '../providers/registry.ts';
import type {
	ReadToolParametersType,
	GrepToolParametersType,
	GlobToolParametersType,
	ListToolParametersType
} from '../tools/index.ts';
import {
	ReadToolParameters,
	executeReadTool,
	GrepToolParameters,
	executeGrepTool,
	GlobToolParameters,
	executeGlobTool,
	ListToolParameters,
	executeListTool
} from '../tools/index.ts';

export type AgentEvent =
	| { type: 'text-delta'; text: string }
	| { type: 'reasoning-delta'; text: string }
	| { type: 'tool-call'; toolName: string; input: unknown }
	| { type: 'tool-result'; toolName: string; output: string }
	| {
			type: 'finish';
			finishReason: string;
			usage?: {
				inputTokens?: number;
				outputTokens?: number;
				reasoningTokens?: number;
				totalTokens?: number;
			};
	  }
	| { type: 'error'; error: Error };

export type AgentLoopOptions = {
	providerId: string;
	modelId: string;
	collectionPath: string;
	vfsId?: string;
	agentInstructions: string;
	question: string;
	maxSteps?: number;
	providerOptions?: Partial<ProviderOptions>;
};

export type AgentLoopResult = {
	answer: string;
	model: { provider: string; model: string };
	events: AgentEvent[];
};

const buildSystemPrompt = (agentInstructions: string): string =>
	[
		'You are btca, an expert documentation search agent.',
		'Your job is to answer questions by searching through the collection of resources.',
		'',
		'You have access to the following tools:',
		'- read: Read file contents with line numbers',
		'- grep: Search file contents using regex patterns',
		'- glob: Find files matching glob patterns',
		'- list: List directory contents',
		'',
		'Guidelines:',
		'- Ground answers in the loaded resources. Do not rely on unstated prior knowledge.',
		'- Search efficiently: start with one focused list/glob pass, then read likely files; only expand search when evidence is insufficient.',
		'- Prefer targeted grep/read over broad repeated scans once candidate files are known.',
		'- Give clear, unambiguous answers. State assumptions, prerequisites, and important version-sensitive caveats.',
		'- For implementation/how-to questions, provide complete step-by-step instructions with commands and code snippets.',
		'- Be concise but thorough in your responses.',
		'- End every answer with a "Sources" section.',
		'- For git resources, source links must be full GitHub blob URLs.',
		'- In "Sources", format git citations as markdown links: "- [repo/relative/path.ext](https://github.com/.../blob/.../repo/relative/path.ext)".',
		'- Do not use raw URLs as link labels.',
		'- Do not repeat a URL in parentheses after a link.',
		'- Do not output sources in "url (url)" format.',
		'- For local resources, cite local file paths (no GitHub URL required).',
		'- If you cannot find the answer, say so clearly',
		'',
		agentInstructions
	].join('\n');

const createTools = (basePath: string, vfsId?: string) => ({
	read: tool({
		description: 'Read the contents of a file. Returns the file contents with line numbers.',
		inputSchema: ReadToolParameters,
		execute: async (params: ReadToolParametersType) => {
			const result = await executeReadTool(params, { basePath, vfsId });
			return result.output;
		}
	}),

	grep: tool({
		description:
			'Search for a regex pattern in file contents. Returns matching lines with file paths and line numbers.',
		inputSchema: GrepToolParameters,
		execute: async (params: GrepToolParametersType) => {
			const result = await executeGrepTool(params, { basePath, vfsId });
			return result.output;
		}
	}),

	glob: tool({
		description:
			'Find files matching a glob pattern (e.g. "**/*.ts", "src/**/*.js"). Returns a list of matching file paths sorted by modification time.',
		inputSchema: GlobToolParameters,
		execute: async (params: GlobToolParametersType) => {
			const result = await executeGlobTool(params, { basePath, vfsId });
			return result.output;
		}
	}),

	list: tool({
		description:
			'List the contents of a directory. Returns files and subdirectories with their types.',
		inputSchema: ListToolParameters,
		execute: async (params: ListToolParametersType) => {
			const result = await executeListTool(params, { basePath, vfsId });
			return result.output;
		}
	})
});

const getInitialContext = async (collectionPath: string, vfsId?: string) => {
	const result = await executeListTool({ path: '.' }, { basePath: collectionPath, vfsId });
	return `Collection contents:\n${result.output}`;
};

export const runAgentLoop = async (options: AgentLoopOptions): Promise<AgentLoopResult> => {
	const {
		providerId,
		modelId,
		collectionPath,
		vfsId,
		agentInstructions,
		question,
		maxSteps = 40
	} = options;

	const systemPrompt = buildSystemPrompt(agentInstructions);
	const sessionId = crypto.randomUUID();

	const mergedProviderOptions =
		providerId === 'openai'
			? { ...options.providerOptions, instructions: systemPrompt, sessionId }
			: options.providerOptions;

	const model = await getModel(providerId, modelId, {
		providerOptions: mergedProviderOptions,
		allowMissingAuth: providerId === 'openai-compat'
	});

	const initialContext = await getInitialContext(collectionPath, vfsId);
	const messages: ModelMessage[] = [
		{
			role: 'user',
			content: `${initialContext}\n\nQuestion: ${question}`
		}
	];

	const tools = createTools(collectionPath, vfsId);
	const events: AgentEvent[] = [];
	let fullText = '';

	const result = streamText({
		model,
		system: systemPrompt,
		messages,
		tools,
		providerOptions:
			providerId === 'openai'
				? { openai: { instructions: systemPrompt, store: false } }
				: undefined,
		stopWhen: stepCountIs(maxSteps)
	});

	for await (const part of result.fullStream) {
		switch (part.type) {
			case 'text-delta':
				fullText += part.text;
				events.push({ type: 'text-delta', text: part.text });
				break;
			case 'reasoning-delta':
				events.push({ type: 'reasoning-delta', text: part.text });
				break;
			case 'tool-call':
				events.push({ type: 'tool-call', toolName: part.toolName, input: part.input });
				break;
			case 'tool-result':
				events.push({
					type: 'tool-result',
					toolName: part.toolName,
					output: typeof part.output === 'string' ? part.output : JSON.stringify(part.output)
				});
				break;
			case 'finish':
				events.push({
					type: 'finish',
					finishReason: part.finishReason ?? 'unknown',
					usage: {
						inputTokens: part.totalUsage?.inputTokens,
						outputTokens: part.totalUsage?.outputTokens,
						reasoningTokens:
							part.totalUsage?.outputTokenDetails?.reasoningTokens ??
							part.totalUsage?.reasoningTokens,
						totalTokens: part.totalUsage?.totalTokens
					}
				});
				break;
			case 'error':
				events.push({
					type: 'error',
					error: part.error instanceof Error ? part.error : new Error(String(part.error))
				});
				break;
		}
	}

	return {
		answer: fullText.trim(),
		model: { provider: providerId, model: modelId },
		events
	};
};

export async function* streamAgentLoop(options: AgentLoopOptions): AsyncGenerator<AgentEvent> {
	const {
		providerId,
		modelId,
		collectionPath,
		vfsId,
		agentInstructions,
		question,
		maxSteps = 40
	} = options;

	const systemPrompt = buildSystemPrompt(agentInstructions);
	const sessionId = crypto.randomUUID();

	const mergedProviderOptions =
		providerId === 'openai'
			? { ...options.providerOptions, instructions: systemPrompt, sessionId }
			: options.providerOptions;

	const model = await getModel(providerId, modelId, {
		providerOptions: mergedProviderOptions,
		allowMissingAuth: providerId === 'openai-compat'
	});

	const initialContext = await getInitialContext(collectionPath, vfsId);
	const messages: ModelMessage[] = [
		{
			role: 'user',
			content: `${initialContext}\n\nQuestion: ${question}`
		}
	];

	const tools = createTools(collectionPath, vfsId);
	const result = streamText({
		model,
		system: systemPrompt,
		messages,
		tools,
		providerOptions:
			providerId === 'openai'
				? { openai: { instructions: systemPrompt, store: false } }
				: undefined,
		stopWhen: stepCountIs(maxSteps)
	});

	for await (const part of result.fullStream) {
		switch (part.type) {
			case 'text-delta':
				yield { type: 'text-delta', text: part.text };
				break;
			case 'reasoning-delta':
				yield { type: 'reasoning-delta', text: part.text };
				break;
			case 'tool-call':
				yield { type: 'tool-call', toolName: part.toolName, input: part.input };
				break;
			case 'tool-result':
				yield {
					type: 'tool-result',
					toolName: part.toolName,
					output: typeof part.output === 'string' ? part.output : JSON.stringify(part.output)
				};
				break;
			case 'finish':
				yield {
					type: 'finish',
					finishReason: part.finishReason ?? 'unknown',
					usage: {
						inputTokens: part.totalUsage?.inputTokens,
						outputTokens: part.totalUsage?.outputTokens,
						reasoningTokens:
							part.totalUsage?.outputTokenDetails?.reasoningTokens ??
							part.totalUsage?.reasoningTokens,
						totalTokens: part.totalUsage?.totalTokens
					}
				};
				break;
			case 'error':
				yield {
					type: 'error',
					error: part.error instanceof Error ? part.error : new Error(String(part.error))
				};
				break;
		}
	}
}
