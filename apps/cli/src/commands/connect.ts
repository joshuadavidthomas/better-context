import { Result } from 'better-result';
import { Command } from 'commander';
import select from '@inquirer/select';
import * as readline from 'readline';
import { spawn } from 'bun';
import { ensureServer } from '../server/manager.ts';
import { createClient, getProviders, updateModel, BtcaError } from '../client/index.ts';
import { dim, green } from '../lib/utils/colors.ts';
import { loginCopilotOAuth } from '../lib/copilot-oauth.ts';
import { loginOpenAIOAuth, saveProviderApiKey } from '../lib/opencode-oauth.ts';
import {
	CURATED_MODELS,
	PROVIDER_AUTH_GUIDANCE,
	PROVIDER_INFO,
	PROVIDER_MODEL_DOCS,
	PROVIDER_SETUP_LINKS
} from '../connect/constants.ts';

/**
 * Format an error for display, including hint if available.
 */
function formatError(error: unknown): string {
	if (error instanceof BtcaError) {
		let output = `Error: ${error.message}`;
		if (error.hint) {
			output += `\n\nHint: ${error.hint}`;
		}
		return output;
	}
	return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

const isPromptCancelled = (error: unknown) =>
	error instanceof Error &&
	(error.name === 'ExitPromptError' ||
		error.message.toLowerCase().includes('canceled') ||
		error.message.toLowerCase().includes('cancelled'));

/**
 * Create a readline interface for prompts.
 */
function createRl(): readline.Interface {
	return readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
}

/**
 * Prompt for input with a default value.
 */
async function promptInput(
	rl: readline.Interface,
	question: string,
	defaultValue?: string
): Promise<string> {
	return new Promise((resolve) => {
		const defaultHint = defaultValue ? ` ${dim(`(${defaultValue})`)}` : '';
		rl.question(`${question}${defaultHint}: `, (answer) => {
			const value = answer.trim();
			resolve(value || defaultValue || '');
		});
	});
}

const promptSelectNumeric = <T extends string>(
	question: string,
	options: { label: string; value: T }[]
) =>
	new Promise<T>((resolve, reject) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		console.log(`\n${question}\n`);
		options.forEach((opt, idx) => {
			console.log(`  ${idx + 1}) ${opt.label}`);
		});
		console.log('');

		rl.question('Enter number: ', (answer) => {
			rl.close();
			const num = parseInt(answer.trim(), 10);
			if (isNaN(num) || num < 1 || num > options.length) {
				reject(new Error('Invalid selection'));
				return;
			}
			resolve(options[num - 1]!.value);
		});
	});

/**
 * Prompt for single selection from a list.
 */
const promptSelect = async <T extends string>(
	question: string,
	options: { label: string; value: T }[]
) => {
	if (options.length === 0) {
		throw new Error('Invalid selection');
	}

	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		return promptSelectNumeric(question, options);
	}

	const selection = await select({
		message: question,
		choices: options.map((option) => ({
			name: option.label,
			value: option.value
		}))
	});
	return selection as T;
};

/**
 * Run opencode auth flow for a provider.
 */
async function runOpencodeAuth(providerId: string): Promise<boolean> {
	console.log(`\nOpening browser for ${providerId} authentication...`);
	console.log('(This requires OpenCode CLI to be installed)\n');

	const result = await Result.tryPromise(async () => {
		const proc = spawn(['opencode', 'auth', '--provider', providerId], {
			stdin: 'inherit',
			stdout: 'inherit',
			stderr: 'inherit'
		});

		const exitCode = await proc.exited;
		return exitCode === 0;
	});

	if (Result.isOk(result)) return result.value;

	console.error(
		'Failed to run opencode auth:',
		result.error instanceof Error ? result.error.message : String(result.error)
	);
	console.error('\nMake sure OpenCode CLI is installed: bun add -g opencode-ai');
	return false;
}

async function runBtcaAuth(providerId: string): Promise<boolean> {
	if (providerId === 'openai') {
		console.log('\nStarting OpenAI OAuth flow...');
		const result = await loginOpenAIOAuth();
		if (!result.ok) {
			console.error(`Failed to authenticate with OpenAI: ${result.error}`);
			return false;
		}
		console.log('OpenAI authentication complete.');
		return true;
	}

	if (providerId === 'github-copilot') {
		console.log('\nStarting GitHub Copilot device flow...');
		const result = await loginCopilotOAuth();
		if (!result.ok) {
			console.error(`Failed to authenticate with GitHub Copilot: ${result.error}`);
			return false;
		}
		console.log('GitHub Copilot authentication complete.');
		return true;
	}

	if (
		providerId === 'opencode' ||
		providerId === 'openrouter' ||
		providerId === 'anthropic' ||
		providerId === 'minimax' ||
		providerId === 'google'
	) {
		const setup = PROVIDER_SETUP_LINKS[providerId];
		if (setup) {
			console.log(`\n${setup.label}: ${setup.url}`);
		}
		const rl = createRl();
		const key = await promptInput(rl, 'Enter API key');
		rl.close();
		if (!key) {
			console.error('API key is required.');
			return false;
		}
		await saveProviderApiKey(providerId, key);
		console.log(`${providerId} API key saved.`);
		return true;
	}

	return runOpencodeAuth(providerId);
}

const promptOpenAICompatSetup = async (options: { includeModel?: boolean } = {}) => {
	const includeModel = options.includeModel ?? true;
	const rl = createRl();
	try {
		const baseURL = await promptInput(rl, 'Base URL');
		const name = await promptInput(rl, 'Provider name');
		const modelId = includeModel ? await promptInput(rl, 'Model ID') : '';
		const apiKey = await promptInput(rl, 'API key (optional)');
		return { baseURL, name, modelId, apiKey };
	} finally {
		rl.close();
	}
};

export const runConnectCommand = async (args: {
	global?: boolean;
	provider?: string;
	model?: string;
	globalOpts?: { server?: string; port?: number };
}) => {
	const result = await Result.tryPromise(async () => {
		const server = await ensureServer({
			serverUrl: args.globalOpts?.server,
			port: args.globalOpts?.port,
			quiet: true
		});
		try {
			const client = createClient(server.url);
			const providers = await getProviders(client);

			if (args.provider && args.model) {
				if (args.provider === 'openai-compat') {
					const { baseURL, name, apiKey } = await promptOpenAICompatSetup({
						includeModel: false
					});
					if (!baseURL || !name) {
						console.error('Error: Base URL and provider name are required.');
						process.exit(1);
					}
					if (apiKey) {
						await saveProviderApiKey(args.provider, apiKey);
						console.log(`${args.provider} API key saved.`);
					}
					const updated = await updateModel(server.url, args.provider, args.model, {
						baseURL,
						name
					});
					console.log(`Model updated: ${updated.provider}/${updated.model}`);
					return;
				}

				const updated = await updateModel(server.url, args.provider, args.model);
				console.log(`Model updated: ${updated.provider}/${updated.model}`);

				const info = PROVIDER_INFO[args.provider];
				if (info?.requiresAuth && !providers.connected.includes(args.provider)) {
					console.warn(`\nWarning: Provider "${args.provider}" is not connected.`);
					console.warn('Run "opencode auth" to configure credentials.');
				}
				return;
			}

			console.log('\n--- Configure AI Provider ---\n');
			const providerOptions: { label: string; value: string }[] = [];

			for (const connectedId of providers.connected) {
				const info = PROVIDER_INFO[connectedId];
				const label = info
					? `${info.label} ${green('(connected)')}`
					: `${connectedId} ${green('(connected)')}`;
				providerOptions.push({ label, value: connectedId });
			}

			for (const provider of providers.all) {
				if (!providers.connected.includes(provider.id)) {
					const info = PROVIDER_INFO[provider.id];
					const label = info ? info.label : provider.id;
					providerOptions.push({ label, value: provider.id });
				}
			}

			const provider = await promptSelect('Select a provider:', providerOptions);
			const isConnected = providers.connected.includes(provider);
			const info = PROVIDER_INFO[provider];

			if (!isConnected && info?.requiresAuth) {
				console.log(`\nProvider "${provider}" requires authentication.`);
				const guidance = PROVIDER_AUTH_GUIDANCE[provider];
				if (guidance) {
					console.log(`\n${guidance}`);
				}
				const success = await runBtcaAuth(provider);
				if (!success) {
					console.warn('\nAuthentication may have failed. Try again later with: opencode auth');
					process.exit(1);
				}
			}

			if (provider === 'openai-compat') {
				const modelDocs = PROVIDER_MODEL_DOCS[provider];
				if (modelDocs) {
					console.log(`\n${modelDocs.label}: ${modelDocs.url}`);
				}

				const { baseURL, name, modelId, apiKey } = await promptOpenAICompatSetup();
				if (!baseURL || !name || !modelId) {
					console.error('Error: Base URL, provider name, and model ID are required.');
					process.exit(1);
				}
				if (apiKey) {
					await saveProviderApiKey(provider, apiKey);
					console.log(`${provider} API key saved.`);
				}

				const updated = await updateModel(server.url, provider, modelId, { baseURL, name });
				console.log(`\nModel configured: ${updated.provider}/${updated.model}`);
				console.log(`\nSaved to: ${updated.savedTo} config`);
				return;
			}

			let model: string;
			const curated = CURATED_MODELS[provider] ?? [];
			const modelDocs = PROVIDER_MODEL_DOCS[provider];
			if (modelDocs) {
				console.log(`\n${modelDocs.label}: ${modelDocs.url}`);
			}

			if (curated.length > 0) {
				const options = [
					...curated.map((modelItem) => ({ label: modelItem.label, value: modelItem.id })),
					{ label: 'Custom model ID...', value: '__custom__' }
				];
				const selection = await promptSelect('Select a model:', options);
				if (selection === '__custom__') {
					const rl = createRl();
					model = await promptInput(rl, 'Enter model ID');
					rl.close();
				} else {
					model = selection;
				}
			} else {
				console.log(`\nCurated models for ${provider} are coming soon.`);
				const rl = createRl();
				model = await promptInput(rl, 'Enter model ID');
				rl.close();
			}

			if (!model) {
				console.error('Error: Model ID is required.');
				process.exit(1);
			}

			const updated = await updateModel(server.url, provider, model);
			console.log(`\nModel configured: ${updated.provider}/${updated.model}`);
			console.log(`\nSaved to: ${updated.savedTo} config`);
		} finally {
			server.stop();
		}
	});

	if (Result.isError(result)) {
		const error = result.error;
		if (error instanceof Error && error.message === 'Invalid selection') {
			console.error('\nError: Invalid selection. Please try again.');
			process.exit(1);
		}
		if (isPromptCancelled(error)) {
			console.log('\nSelection cancelled.');
			process.exit(0);
		}
		console.error(formatError(error));
		process.exit(1);
	}
};

export const connectCommand = new Command('connect')
	.description('Configure the AI provider and model')
	.option('-g, --global', 'Save to global config instead of project config')
	.option(
		'-p, --provider <id>',
		'Provider ID (opencode, openrouter, openai, openai-compat, google, anthropic, github-copilot, minimax)'
	)
	.option('-m, --model <id>', 'Model ID (e.g., "claude-haiku-4-5")')
	.action(async (options: { global?: boolean; provider?: string; model?: string }, command) => {
		const globalOpts = command.parent?.opts() as { server?: string; port?: number } | undefined;
		await runConnectCommand({
			global: options.global,
			provider: options.provider,
			model: options.model,
			globalOpts
		});
	});
