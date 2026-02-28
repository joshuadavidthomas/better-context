import os from 'node:os';
import path from 'node:path';
import { parseJsonc } from '@btca/shared';
import { Effect } from 'effect';
import { ensureServer } from '../server/manager.ts';
import { createClient, getConfig, getProviders } from '../client/index.ts';
import packageJson from '../../package.json';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : (packageJson.version ?? '0.0.0');

const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.config', 'btca', 'btca.config.jsonc');
const PROJECT_CONFIG_FILENAME = 'btca.config.jsonc';
const NPM_REGISTRY_URL = 'https://registry.npmjs.org/btca';

type NpmInfo = {
	'dist-tags'?: {
		latest?: string;
	};
	version?: string;
};

type StoredResource = {
	name?: unknown;
};

type StoredConfig = {
	model?: unknown;
	provider?: unknown;
	resources?: unknown;
};

const readConfigFromPath = async (configPath: string): Promise<StoredConfig | null> => {
	const configFile = Bun.file(configPath);
	if (!(await configFile.exists())) {
		return null;
	}

	const content = await configFile.text();
	const parsed: unknown = parseJsonc(content);
	return parsed as StoredConfig;
};

const listResourceNames = (config: StoredConfig | null): string[] => {
	if (!config || !Array.isArray(config.resources)) {
		return [];
	}

	return config.resources
		.filter((resource) => {
			const candidate = resource as StoredResource;
			return candidate && typeof candidate === 'object' && typeof candidate.name === 'string';
		})
		.map((resource) => (resource as StoredResource).name as string);
};

const getConfigOrigin = (
	value: 'provider' | 'model',
	projectConfig: StoredConfig | null,
	globalConfig: StoredConfig | null
): string => {
	const hasInProject = projectConfig && typeof projectConfig[value] === 'string';
	if (hasInProject) return 'project';
	const hasInGlobal = globalConfig && typeof globalConfig[value] === 'string';
	if (hasInGlobal) return 'global';
	return 'default';
};

const compareVersions = (left: string, right: string): number => {
	const toParts = (value: string) =>
		(value.trim().replace(/^v/, '').split(/[-+]/, 1)[0] ?? '')
			.split('.')
			.map((part) => Number.parseInt(part, 10));

	const l = toParts(left);
	const r = toParts(right);
	const max = Math.max(l.length, r.length);

	for (let i = 0; i < max; i += 1) {
		const lv = Number.isNaN(l[i] ?? NaN) ? 0 : (l[i] ?? 0);
		const rv = Number.isNaN(r[i] ?? NaN) ? 0 : (r[i] ?? 0);
		if (lv > rv) return 1;
		if (lv < rv) return -1;
	}

	return 0;
};

const getLatestVersion = async (): Promise<string | null> => {
	try {
		const response = await fetch(NPM_REGISTRY_URL);
		if (!response.ok) {
			return null;
		}

		const info = (await response.json()) as NpmInfo;
		return info['dist-tags']?.latest ?? info.version ?? null;
	} catch {
		return null;
	}
};

const printResourceList = (label: string, resources: string[] | null) => {
	if (resources === null) {
		console.log(`${label}: (not found)`);
		return;
	}

	console.log(`${label}:`);
	if (resources.length === 0) {
		console.log('  (none)');
		return;
	}

	for (const resource of resources) {
		console.log(`  ${resource}`);
	}
};

export const runStatusCommand = async () => {
	const server = await ensureServer({ quiet: true });
	const client = createClient(server.url);
	const projectPath = path.resolve(process.cwd(), PROJECT_CONFIG_FILENAME);

	return Effect.runPromise(
		Effect.acquireUseRelease(
			Effect.succeed(server),
			() =>
				Effect.gen(function* () {
					const [config, providers, globalConfig, projectConfig] = yield* Effect.tryPromise(() =>
						Promise.all([
							getConfig(client),
							getProviders(client),
							readConfigFromPath(GLOBAL_CONFIG_PATH),
							readConfigFromPath(projectPath)
						])
					);

					const connected = Array.isArray(providers.connected) ? providers.connected : [];
					const isAuthenticated = connected.includes(config.provider);
					const latestVersion = yield* Effect.tryPromise(() => getLatestVersion());
					const hasUpdate = latestVersion && compareVersions(VERSION, latestVersion) < 0;

					yield* Effect.sync(() => {
						console.log('\n--- btca status ---\n');
						const modelSource = getConfigOrigin('model', projectConfig, globalConfig);
						const providerSource = getConfigOrigin('provider', projectConfig, globalConfig);
						console.log(`Selected model: ${config.model} (${modelSource})`);
						console.log(`Selected provider: ${config.provider} (${providerSource})`);
						console.log(`Selected provider authed: ${isAuthenticated ? 'yes' : 'no'}`);
						console.log('');

						printResourceList(
							'Global resources',
							globalConfig ? listResourceNames(globalConfig) : null
						);
						printResourceList(
							'Project resources',
							projectConfig ? listResourceNames(projectConfig) : null
						);

						console.log(`\nbtca version: ${VERSION}`);
						if (latestVersion) {
							console.log(`Latest version: ${latestVersion}`);
							if (hasUpdate) {
								console.log('Update available: run "bun add -g btca@latest"');
							} else {
								console.log('btca is up to date');
							}
						} else {
							console.log('Latest version: unavailable');
						}
					});
				}),
			(serverManager) => Effect.sync(() => serverManager.stop())
		)
	);
};
