import { Result } from 'better-result';
import { Command } from 'commander';
import { startServer } from 'btca-server';
import { createClient, getConfig } from '../client/index.ts';
import { formatCliCommandError } from '../effect/errors.ts';
import { setTelemetryContext, trackTelemetryEvent } from '../lib/telemetry.ts';

const DEFAULT_PORT = 8080;

export const serveCommand = new Command('serve')
	.description('Start the btca server and listen for requests')
	.option('-p, --port <port>', 'Port to listen on (default: 8080)')
	.action(async (options: { port?: string }) => {
		const commandName = 'serve';
		const startedAt = Date.now();
		const port = options.port ? parseInt(options.port, 10) : DEFAULT_PORT;

		const result = await Result.tryPromise(async () => {
			console.log(`Starting btca server on port ${port}...`);
			const server = await startServer({ port });
			try {
				const client = createClient(server.url);
				const config = await getConfig(client);
				setTelemetryContext({ provider: config.provider, model: config.model });
			} catch {
				// Ignore config failures for telemetry
			}
			await trackTelemetryEvent({
				event: 'cli_started',
				properties: { command: commandName, mode: 'serve' }
			});
			await trackTelemetryEvent({
				event: 'cli_server_started',
				properties: { command: commandName, mode: 'serve' }
			});
			console.log(`btca server running at ${server.url}`);
			console.log('Press Ctrl+C to stop');

			// Handle graceful shutdown
			const shutdown = () => {
				console.log('\nShutting down server...');
				server.stop();
				process.exit(0);
			};

			process.on('SIGINT', shutdown);
			process.on('SIGTERM', shutdown);

			// Keep the process alive
			await new Promise(() => {
				// Never resolves - keeps the server running
			});
		});

		if (Result.isError(result)) {
			const durationMs = Date.now() - startedAt;
			const error = result.error;
			const errorName = error instanceof Error ? error.name : 'UnknownError';
			await trackTelemetryEvent({
				event: 'cli_server_failed',
				properties: { command: commandName, mode: 'serve', durationMs, errorName, exitCode: 1 }
			});
			console.error(formatCliCommandError(result.error));
			process.exit(1);
		}
	});
