import { Command, Options } from '@effect/cli';
import { BunContext } from '@effect/platform-bun';
import { Cause, Effect, Exit, Option, pipe } from 'effect';
import { createClient, getResources, clearResources } from '../client/index.ts';
import { formatCliCommandError } from './errors.ts';
import { ensureServer } from '../server/manager.ts';

const serverOption = Options.text('server').pipe(Options.optional);
const portOption = Options.integer('port').pipe(Options.optional);

const resolveServerOptions = (options: {
	server: Option.Option<string>;
	port: Option.Option<number>;
}) => ({
	serverUrl: Option.getOrUndefined(options.server),
	port: Option.getOrUndefined(options.port),
	quiet: true
});

const clear = Command.make(
	'clear',
	{ server: serverOption, port: portOption },
	({ server, port }) =>
		Effect.tryPromise(async () => {
			const instance = await ensureServer(resolveServerOptions({ server, port }));
			try {
				const result = await clearResources(instance.url);
				console.log(`Cleared ${result.cleared} resource(s).`);
			} finally {
				instance.stop();
			}
		})
);

const resources = Command.make(
	'resources',
	{ server: serverOption, port: portOption },
	({ server, port }) =>
		Effect.tryPromise(async () => {
			const instance = await ensureServer(resolveServerOptions({ server, port }));
			try {
				const client = createClient(instance.url);
				const { resources } = await getResources(client);
				if (resources.length === 0) {
					console.log('No resources configured.');
					return;
				}

				console.log('Configured resources:\n');
				for (const resource of resources) {
					if (resource.type === 'git') {
						console.log(`  ${resource.name} (git)`);
						console.log(`    URL: ${resource.url}`);
						console.log(`    Branch: ${resource.branch}`);
						if (resource.searchPaths && resource.searchPaths.length > 0) {
							console.log(`    Search Paths: ${resource.searchPaths.join(', ')}`);
						} else if (resource.searchPath) {
							console.log(`    Search Path: ${resource.searchPath}`);
						}
						if (resource.specialNotes) console.log(`    Notes: ${resource.specialNotes}`);
					} else if (resource.type === 'local') {
						console.log(`  ${resource.name} (local)`);
						console.log(`    Path: ${resource.path}`);
						if (resource.specialNotes) console.log(`    Notes: ${resource.specialNotes}`);
					} else {
						console.log(`  ${resource.name} (npm)`);
						console.log(`    Package: ${resource.package}`);
						if (resource.version) console.log(`    Version: ${resource.version}`);
						if (resource.specialNotes) console.log(`    Notes: ${resource.specialNotes}`);
					}
					console.log('');
				}
			} finally {
				instance.stop();
			}
		})
);

const root = pipe(Command.make('btca'), Command.withSubcommands([clear, resources]));

export const runEffectCli = async (
	argv: ReadonlyArray<string>,
	version: string
): Promise<void> => {
	const run = Command.run(root, {
		name: 'btca',
		version
	});
	const exit = await Effect.runPromiseExit(run(argv).pipe(Effect.provide(BunContext.layer)));
	if (Exit.isFailure(exit)) {
		console.error(formatCliCommandError(Cause.squash(exit.cause)));
		process.exit(1);
	}
};
