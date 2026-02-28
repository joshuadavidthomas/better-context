import * as readline from 'readline';
import { ensureServer } from '../server/manager.ts';
import { createClient, getResources, removeResource } from '../client/index.ts';
import { dim } from '../lib/utils/colors.ts';

/**
 * Resource definition types matching server schema.
 */
interface GitResource {
	type: 'git';
	name: string;
	url: string;
	branch: string;
	searchPath?: string;
	searchPaths?: string[];
	specialNotes?: string;
}

interface LocalResource {
	type: 'local';
	name: string;
	path: string;
	specialNotes?: string;
}

interface NpmResource {
	type: 'npm';
	name: string;
	package: string;
	version?: string | null;
	specialNotes?: string;
}

type ResourceDefinition = GitResource | LocalResource | NpmResource;

/**
 * Interactive single-select prompt for resources.
 * Displays resource name with dimmed path/URL.
 */
async function selectSingleResource(resources: ResourceDefinition[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		console.log('\nSelect a resource to remove:\n');
		resources.forEach((r, idx) => {
			const location =
				r.type === 'git'
					? r.url
					: r.type === 'local'
						? r.path
						: `${r.package}${r.version ? `@${r.version}` : ''}`;
			console.log(`  ${idx + 1}. ${r.name} ${dim(`(${location})`)}`);
		});
		console.log('');

		rl.question('Enter number: ', (answer) => {
			rl.close();
			const num = parseInt(answer.trim(), 10);
			if (isNaN(num) || num < 1 || num > resources.length) {
				reject(new Error('Invalid selection'));
				return;
			}
			resolve(resources[num - 1]!.name);
		});
	});
}

export const runRemoveCommand = async (args: {
	name?: string;
	global?: boolean;
	globalOpts?: { server?: string; port?: number };
}) => {
	const server = await ensureServer({
		serverUrl: args.globalOpts?.server,
		port: args.globalOpts?.port,
		quiet: true
	});

	try {
		const client = createClient(server.url);
		const { resources } = await getResources(client);

		if (resources.length === 0) {
			console.log('No resources configured.');
			return;
		}

		const names = resources.map((r) => r.name);
		const resourceName = args.name
			? args.name
			: await selectSingleResource(resources as ResourceDefinition[]);

		if (!names.includes(resourceName)) {
			throw new Error(`Resource "${resourceName}" not found. Available resources: ${names.join(', ')}`);
		}

		await removeResource(server.url, resourceName);
		console.log(`Removed resource: ${resourceName}`);
	} finally {
		server.stop();
	}
};
