import { startServer } from 'btca-server';
import { Effect } from 'effect';
import { createClient, getConfigEffect } from '../client/index.ts';
import { setTelemetryContext, trackTelemetryEvent } from '../lib/telemetry.ts';

const DEFAULT_PORT = 8080;

const trackServeEvent = (event: string, properties: Record<string, unknown>) =>
	Effect.tryPromise(() =>
		trackTelemetryEvent({
			event,
			properties
		})
	);

const setServeTelemetryContext = (serverUrl: string) =>
	Effect.gen(function* () {
		const client = createClient(serverUrl);
		const config = yield* getConfigEffect(client);
		yield* Effect.sync(() =>
			setTelemetryContext({ provider: config.provider, model: config.model })
		);
	}).pipe(Effect.ignore);

export const runServeCommand = (options: { port?: number } = {}) => {
	const commandName = 'serve';
	const startedAt = Date.now();
	const port = options.port ?? DEFAULT_PORT;

	return Effect.gen(function* () {
		yield* Effect.sync(() => console.log(`Starting btca server on port ${port}...`));
		const server = yield* Effect.tryPromise(() => startServer({ port }));

		yield* setServeTelemetryContext(server.url);
		yield* trackServeEvent('cli_started', { command: commandName, mode: 'serve' });
		yield* trackServeEvent('cli_server_started', { command: commandName, mode: 'serve' });
		yield* Effect.sync(() => {
			console.log(`btca server running at ${server.url}`);
			console.log('Press Ctrl+C to stop');
		});

		yield* Effect.tryPromise(
			() =>
				new Promise<void>((resolve) => {
					const shutdown = () => {
						console.log('\nShutting down server...');
						process.off('SIGINT', shutdown);
						process.off('SIGTERM', shutdown);
						server.stop();
						resolve();
					};

					process.on('SIGINT', shutdown);
					process.on('SIGTERM', shutdown);
				})
		);
		yield* trackServeEvent('cli_server_completed', {
			command: commandName,
			mode: 'serve',
			durationMs: Date.now() - startedAt,
			exitCode: 0
		});
	}).pipe(
		Effect.tapError((error) =>
			trackServeEvent('cli_server_failed', {
				command: commandName,
				mode: 'serve',
				durationMs: Date.now() - startedAt,
				errorName: error instanceof Error ? error.name : 'UnknownError',
				exitCode: 1
			})
		)
	);
};
