import select from '@inquirer/select';
import * as readline from 'readline';
import { Effect } from 'effect';
import { withServerEffect } from '../server/manager.ts';
import { createClient, getProviders } from '../client/index.ts';
import { effectFromPromise } from '../effect/errors.ts';
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
	return Effect.runPromise(
		withServerEffect(
			{
				serverUrl: args.globalOpts?.server,
				port: args.globalOpts?.port,
				quiet: true
			},
			(server) =>
				Effect.gen(function* () {
					const client = createClient(server.url);
					const providers = yield* effectFromPromise(() => getProviders(client));

					if (args.provider && !providers.connected.includes(args.provider)) {
						const hint =
							providers.connected.length > 0
								? `Connected providers: ${providers.connected.join(', ')}`
								: 'No providers are currently connected.';
						yield* Effect.fail(new Error(`Provider "${args.provider}" is not connected. ${hint}`));
					}

					if (providers.connected.length === 0) {
						yield* Effect.sync(() => console.log('No providers are currently connected.'));
						return;
					}

					const provider =
						args.provider ??
						(yield* effectFromPromise(() =>
							promptSelect(
								'Select a connected provider to disconnect:',
								providers.connected.map((id) => ({ label: id, value: id }))
							)
						));

					if (!providers.connected.includes(provider)) {
						yield* Effect.fail(new Error(`Provider "${provider}" is not connected.`));
					}

					const removed = yield* effectFromPromise(() => removeProviderAuth(provider));
					if (!removed) {
						yield* Effect.sync(() =>
							console.warn(
								`No saved credentials found for "${provider}". If it's still connected, check env vars.`
							)
						);
					} else {
						yield* Effect.sync(() =>
							console.log(`Disconnected "${provider}" and removed saved credentials.`)
						);
					}
				})
		)
	);
};
