import { Result } from 'better-result';
import { Command } from 'commander';
import { ensureServer } from '../server/manager.ts';
import { createClient, getResources } from '../client/index.ts';
import { formatCliCommandError } from '../effect/errors.ts';

export const runResourcesCommand = async (globalOpts?: { server?: string; port?: number }) => {
	const server = await ensureServer({
		serverUrl: globalOpts?.server,
		port: globalOpts?.port,
		quiet: true
	});
	try {
		const client = createClient(server.url);
		const { resources } = await getResources(client);

		if (resources.length === 0) {
			console.log('No resources configured.');
			return;
		}

		console.log('Configured resources:\n');
		for (const r of resources) {
			if (r.type === 'git') {
				console.log(`  ${r.name} (git)`);
				console.log(`    URL: ${r.url}`);
				console.log(`    Branch: ${r.branch}`);
				if (r.searchPaths && r.searchPaths.length > 0) {
					console.log(`    Search Paths: ${r.searchPaths.join(', ')}`);
				} else if (r.searchPath) {
					console.log(`    Search Path: ${r.searchPath}`);
				}
				if (r.specialNotes) console.log(`    Notes: ${r.specialNotes}`);
			} else if (r.type === 'local') {
				console.log(`  ${r.name} (local)`);
				console.log(`    Path: ${r.path}`);
				if (r.specialNotes) console.log(`    Notes: ${r.specialNotes}`);
			} else {
				console.log(`  ${r.name} (npm)`);
				console.log(`    Package: ${r.package}`);
				if (r.version) console.log(`    Version: ${r.version}`);
				if (r.specialNotes) console.log(`    Notes: ${r.specialNotes}`);
			}
			console.log('');
		}
	} finally {
		server.stop();
	}
};

export const resourcesCommand = new Command('resources')
	.description('List all configured resources')
	.action(async (_options, command) => {
		const globalOpts = command.parent?.opts() as { server?: string; port?: number } | undefined;
		const result = await Result.tryPromise(() => runResourcesCommand(globalOpts));

		if (Result.isError(result)) {
			console.error(formatCliCommandError(result.error));
			process.exit(1);
		}
	});
