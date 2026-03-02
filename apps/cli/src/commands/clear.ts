import { Effect } from 'effect';
import { withServerEffect } from '../server/manager.ts';
import { clearResourcesEffect } from '../client/index.ts';

export const runClearCommand = (globalOpts?: { server?: string; port?: number }) =>
	withServerEffect(
		{
			serverUrl: globalOpts?.server,
			port: globalOpts?.port,
			quiet: true
		},
		(server) =>
			Effect.gen(function* () {
				const result = yield* clearResourcesEffect(server.url);
				yield* Effect.sync(() => console.log(`Cleared ${result.cleared} resource(s).`));
			})
	);
