import { startServer } from 'btca-server';
import { createClient, getConfig } from '../client/index.ts';
import { setTelemetryContext, trackTelemetryEvent } from '../lib/telemetry.ts';

const DEFAULT_PORT = 8080;

export const runServeCommand = async (options: { port?: number } = {}) => {
	const commandName = 'serve';
	const startedAt = Date.now();
	const port = options.port ?? DEFAULT_PORT;

	try {
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

		let resolveShutdown: (() => void) | null = null;
		const shutdownPromise = new Promise<void>((resolve) => {
			resolveShutdown = resolve;
		});

		const shutdown = () => {
			console.log('\nShutting down server...');
			process.off('SIGINT', shutdown);
			process.off('SIGTERM', shutdown);
			server.stop();
			resolveShutdown?.();
		};

		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);
		await shutdownPromise;
		await trackTelemetryEvent({
			event: 'cli_server_completed',
			properties: {
				command: commandName,
				mode: 'serve',
				durationMs: Date.now() - startedAt,
				exitCode: 0
			}
		});
	} catch (error) {
		const durationMs = Date.now() - startedAt;
		const errorName = error instanceof Error ? error.name : 'UnknownError';
		await trackTelemetryEvent({
			event: 'cli_server_failed',
			properties: { command: commandName, mode: 'serve', durationMs, errorName, exitCode: 1 }
		});
		throw error;
	}
};
