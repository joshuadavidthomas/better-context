import { ensureServer } from '../server/manager.ts';
import { clearResources } from '../client/index.ts';

export const runClearCommand = async (globalOpts?: { server?: string; port?: number }) => {
	const server = await ensureServer({
		serverUrl: globalOpts?.server,
		port: globalOpts?.port,
		quiet: true
	});
	try {
		const result = await clearResources(server.url);
		console.log(`Cleared ${result.cleared} resource(s).`);
	} finally {
		server.stop();
	}
};
