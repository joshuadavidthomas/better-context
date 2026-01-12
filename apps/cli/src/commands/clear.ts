import { Command } from 'commander';
import { ensureServer } from '../server/manager.ts';
import { clearResources } from '../client/index.ts';

export const clearCommand = new Command('clear')
	.description('Clear all locally cloned resources')
	.action(async (_options, command) => {
		const globalOpts = command.parent?.opts() as { server?: string; port?: number } | undefined;

		try {
			const server = await ensureServer({
				serverUrl: globalOpts?.server,
				port: globalOpts?.port,
				quiet: true
			});

			const result = await clearResources(server.url);
			console.log(`Cleared ${result.cleared} resource(s).`);

			server.stop();
		} catch (error) {
			console.error('Error:', error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	});
