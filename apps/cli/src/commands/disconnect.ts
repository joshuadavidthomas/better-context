import select from '@inquirer/select';
import * as readline from 'readline';
import { ensureServer } from '../server/manager.ts';
import { createClient, getProviders } from '../client/index.ts';
import { removeProviderAuth } from '../lib/opencode-oauth.ts';

/**
 * Prompt for single selection from a list.
 */
async function promptSelect<T extends string>(
	question: string,
	options: { label: string; value: T }[]
) {
	if (options.length === 0) {
		throw new Error('Invalid selection');
	}

	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		return new Promise<T>((resolve, reject) => {
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
	}

	const selection = await select({
		message: question,
		choices: options.map((option) => ({
			name: option.label,
			value: option.value
		}))
	});
	return selection as T;
}

export const runDisconnectCommand = async (args: {
	provider?: string;
	globalOpts?: { server?: string; port?: number };
}) => {
	const server = await ensureServer({
		serverUrl: args.globalOpts?.server,
		port: args.globalOpts?.port,
		quiet: true
	});
	try {
		const client = createClient(server.url);
		const providers = await getProviders(client);

		if (providers.connected.length === 0) {
			console.log('No providers are currently connected.');
			return;
		}

		const provider =
			args.provider ??
			(await promptSelect(
				'Select a connected provider to disconnect:',
				providers.connected.map((id) => ({ label: id, value: id }))
			));

		if (!providers.connected.includes(provider)) {
			console.error(`Provider "${provider}" is not connected.`);
			process.exit(1);
		}

		const removed = await removeProviderAuth(provider);
		if (!removed) {
			console.warn(
				`No saved credentials found for "${provider}". If it's still connected, check env vars.`
			);
		} else {
			console.log(`Disconnected "${provider}" and removed saved credentials.`);
		}
	} finally {
		server.stop();
	}
};
