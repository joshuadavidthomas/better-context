import { Effect } from 'effect';
import { withServerEffect } from '../server/manager.ts';
import { createClient, getResources } from '../client/index.ts';
import { effectFromPromise } from '../effect/errors.ts';

export const runResourcesCommand = async (globalOpts?: { server?: string; port?: number }) => {
	return Effect.runPromise(
		withServerEffect(
			{
				serverUrl: globalOpts?.server,
				port: globalOpts?.port,
				quiet: true
			},
			(server) =>
				Effect.gen(function* () {
					const client = createClient(server.url);
					const { resources } = yield* effectFromPromise(() => getResources(client));

					if (resources.length === 0) {
						yield* Effect.sync(() => console.log('No resources configured.'));
						return;
					}

					yield* Effect.sync(() => console.log('Configured resources:\n'));
					for (const r of resources) {
						yield* Effect.sync(() => {
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
						});
					}
				})
		)
	);
};
