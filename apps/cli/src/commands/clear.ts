import { Effect } from 'effect';
import { withServerEffect } from '../server/manager.ts';
import { clearResources } from '../client/index.ts';
import { effectFromPromise } from '../effect/errors.ts';

export const runClearCommand = async (globalOpts?: { server?: string; port?: number }) => {
	return Effect.runPromise(
		withServerEffect(
			{
				serverUrl: globalOpts?.server,
				port: globalOpts?.port,
				quiet: true
			},
			(server) =>
				Effect.gen(function* () {
					const result = yield* effectFromPromise(() => clearResources(server.url));
					yield* Effect.sync(() => console.log(`Cleared ${result.cleared} resource(s).`));
				})
		)
	);
};
