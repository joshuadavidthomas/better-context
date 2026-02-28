import { Result } from 'better-result';
import { Command } from 'commander';
import { ensureServer } from '../server/manager.ts';
import { clearResources } from '../client/index.ts';
import { formatCliCommandError } from '../effect/errors.ts';

export const runClearCommand = async (globalOpts?: { server?: string; port?: number }) => {
	const server = await ensureServer({
		serverUrl: globalOpts?.server,
		port: globalOpts?.port,
		quiet: true
	});
	try {
		const result = await clearResources(server.url);
		console.log(`Cleared ${result.cleared} resource(s).`);
	} finally {
		server.stop();
	}
};

export const clearCommand = new Command('clear')
	.description('Clear all locally cloned resources')
	.action(async (_options, command) => {
		const globalOpts = command.parent?.opts() as { server?: string; port?: number } | undefined;
		const result = await Result.tryPromise(() => runClearCommand(globalOpts));

		if (Result.isError(result)) {
			console.error(formatCliCommandError(result.error));
			process.exit(1);
		}
	});
