import { Command } from 'commander';
import { ensureServer } from '../server/manager.ts';
import {
	createClient,
	getResources,
	updateModel,
	addResource,
	removeResource
} from '../client/index.ts';

// Model subcommand
const modelCommand = new Command('model')
	.description('Set the AI model and provider')
	.requiredOption('-p, --provider <provider>', 'Provider ID (e.g., "opencode", "anthropic")')
	.requiredOption('-m, --model <model>', 'Model ID (e.g., "claude-haiku-4-5")')
	.action(async (options, command) => {
		const globalOpts = command.parent?.parent?.opts() as
			| { server?: string; port?: number }
			| undefined;

		try {
			const server = await ensureServer({
				serverUrl: globalOpts?.server,
				port: globalOpts?.port,
				quiet: true
			});

			const result = await updateModel(
				server.url,
				options.provider as string,
				options.model as string
			);
			console.log(`Model updated: ${result.provider}/${result.model}`);

			server.stop();
		} catch (error) {
			console.error('Error:', error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	});

// Resources list subcommand
const resourcesListCommand = new Command('list')
	.description('List all configured resources')
	.action(async (_options, command) => {
		const globalOpts = command.parent?.parent?.parent?.opts() as
			| { server?: string; port?: number }
			| undefined;

		try {
			const server = await ensureServer({
				serverUrl: globalOpts?.server,
				port: globalOpts?.port,
				quiet: true
			});

			const client = createClient(server.url);
			const { resources } = await getResources(client);

			if (resources.length === 0) {
				console.log('No resources configured.');
			} else {
				console.log('Configured resources:\n');
				for (const r of resources) {
					if (r.type === 'git') {
						console.log(`  ${r.name} (git)`);
						console.log(`    URL: ${r.url}`);
						console.log(`    Branch: ${r.branch}`);
						if (r.searchPath) console.log(`    Search Path: ${r.searchPath}`);
						if (r.specialNotes) console.log(`    Notes: ${r.specialNotes}`);
					} else {
						console.log(`  ${r.name} (local)`);
						console.log(`    Path: ${r.path}`);
						if (r.specialNotes) console.log(`    Notes: ${r.specialNotes}`);
					}
					console.log('');
				}
			}

			server.stop();
		} catch (error) {
			console.error('Error:', error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	});

// Resources add subcommand
const resourcesAddCommand = new Command('add')
	.description('Add a new resource')
	.requiredOption('-n, --name <name>', 'Resource name')
	.requiredOption('-t, --type <type>', 'Resource type (git or local)')
	.option('-u, --url <url>', 'Git repository URL (required for git type)')
	.option('-b, --branch <branch>', 'Git branch (default: main)')
	.option('--path <path>', 'Local path (required for local type)')
	.option('--search-path <searchPath>', 'Subdirectory to focus on')
	.option('--notes <notes>', 'Special notes for the AI')
	.action(async (options, command) => {
		const globalOpts = command.parent?.parent?.parent?.opts() as
			| { server?: string; port?: number }
			| undefined;

		try {
			const server = await ensureServer({
				serverUrl: globalOpts?.server,
				port: globalOpts?.port,
				quiet: true
			});

			const type = options.type as string;

			if (type === 'git') {
				if (!options.url) {
					console.error('Error: --url is required for git resources');
					process.exit(1);
				}
				await addResource(server.url, {
					type: 'git',
					name: options.name as string,
					url: options.url as string,
					branch: (options.branch as string) ?? 'main',
					...(options.searchPath && { searchPath: options.searchPath as string }),
					...(options.notes && { specialNotes: options.notes as string })
				});
				console.log(`Added git resource: ${options.name}`);
			} else if (type === 'local') {
				if (!options.path) {
					console.error('Error: --path is required for local resources');
					process.exit(1);
				}
				await addResource(server.url, {
					type: 'local',
					name: options.name as string,
					path: options.path as string,
					...(options.notes && { specialNotes: options.notes as string })
				});
				console.log(`Added local resource: ${options.name}`);
			} else {
				console.error('Error: --type must be "git" or "local"');
				process.exit(1);
			}

			server.stop();
		} catch (error) {
			console.error('Error:', error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	});

// Resources remove subcommand
const resourcesRemoveCommand = new Command('remove')
	.description('Remove a resource from the configuration')
	.requiredOption('-n, --name <name>', 'Resource name to remove')
	.action(async (options, command) => {
		const globalOpts = command.parent?.parent?.parent?.opts() as
			| { server?: string; port?: number }
			| undefined;

		try {
			const server = await ensureServer({
				serverUrl: globalOpts?.server,
				port: globalOpts?.port,
				quiet: true
			});

			await removeResource(server.url, options.name as string);
			console.log(`Removed resource: ${options.name}`);

			server.stop();
		} catch (error) {
			console.error('Error:', error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	});

// Resources subcommand group
const resourcesCommand = new Command('resources').description('Manage resources');

resourcesCommand.addCommand(resourcesListCommand);
resourcesCommand.addCommand(resourcesAddCommand);
resourcesCommand.addCommand(resourcesRemoveCommand);

// Config command group
export const configCommand = new Command('config').description('Manage btca configuration');

configCommand.addCommand(modelCommand);
configCommand.addCommand(resourcesCommand);
