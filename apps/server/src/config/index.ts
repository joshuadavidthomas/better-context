import { FileSystem } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { ResourceDefinitionSchema, type ResourceDefinition } from '../resources/schema.ts';

export const GLOBAL_CONFIG_DIR = '~/.config/btca';
export const GLOBAL_CONFIG_FILENAME = 'btca.config.jsonc';
export const GLOBAL_DATA_DIR = '~/.local/share/btca';
export const PROJECT_CONFIG_FILENAME = 'btca.config.jsonc';
export const PROJECT_DATA_DIR = '.btca';
export const CONFIG_SCHEMA_URL = 'https://btca.dev/btca.schema.json';

export const DEFAULT_MODEL = 'claude-haiku-4-5';
export const DEFAULT_PROVIDER = 'opencode';

export const DEFAULT_RESOURCES: ResourceDefinition[] = [
	{
		name: 'svelte',
		specialNotes:
			'This is the svelte docs website repo, not the actual svelte repo. Focus on the content directory, it has all the markdown files for the docs.',
		type: 'git',
		url: 'https://github.com/sveltejs/svelte.dev',
		branch: 'main',
		searchPath: 'apps/svelte.dev'
	},
	{
		name: 'tailwindcss',
		specialNotes:
			'This is the tailwindcss docs website repo, not the actual tailwindcss repo. Use the docs to answer questions about tailwindcss.',
		type: 'git',
		url: 'https://github.com/tailwindlabs/tailwindcss.com',
		searchPath: 'src/docs',
		branch: 'main'
	},
	{
		type: 'git',
		name: 'nextjs',
		url: 'https://github.com/vercel/next.js',
		branch: 'canary',
		searchPath: 'docs',
		specialNotes:
			'These are the docs for the next.js framework, not the actual next.js repo. Use the docs to answer questions about next.js.'
	}
];

export const StoredConfigSchema = Schema.Struct({
	$schema: Schema.optional(Schema.String),
	resources: Schema.Array(ResourceDefinitionSchema),
	model: Schema.String,
	provider: Schema.String
});

export type StoredConfig = typeof StoredConfigSchema.Type;

export interface Config {
	resourcesDirectory: string;
	resources: readonly ResourceDefinition[];
	model: string;
	provider: string;
}

const expandHome = (path: string): string => {
	const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
	if (path.startsWith('~/')) {
		return home + path.slice(1);
	}
	return path;
};

const parseJsonc = (content: string): unknown => {
	const stripped = content
		.replace(/\/\/.*$/gm, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.trim();
	return JSON.parse(stripped);
};

const createDefaultConfig = (configPath: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;

		const configDir = configPath.slice(0, configPath.lastIndexOf('/'));
		yield* fs
			.makeDirectory(configDir, { recursive: true })
			.pipe(Effect.catchAll(() => Effect.void));

		const defaultStored: StoredConfig = {
			$schema: CONFIG_SCHEMA_URL,
			resources: DEFAULT_RESOURCES,
			model: DEFAULT_MODEL,
			provider: DEFAULT_PROVIDER
		};

		yield* fs.writeFileString(configPath, JSON.stringify(defaultStored, null, 2));

		return defaultStored;
	});

const loadConfigFromPath = (configPath: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const content = yield* fs.readFileString(configPath);
		const parsed = parseJsonc(content);
		return yield* Schema.decodeUnknown(StoredConfigSchema)(parsed);
	});

export const loadConfig = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const cwd = process.cwd();

	const projectConfigPath = `${cwd}/${PROJECT_CONFIG_FILENAME}`;
	const projectConfigExists = yield* fs.exists(projectConfigPath);

	if (projectConfigExists) {
		const stored = yield* loadConfigFromPath(projectConfigPath);
		const resourcesDirectory = `${cwd}/${PROJECT_DATA_DIR}/resources`;

		return {
			resourcesDirectory,
			resources: stored.resources,
			model: stored.model,
			provider: stored.provider
		} satisfies Config;
	}

	const globalConfigPath = `${expandHome(GLOBAL_CONFIG_DIR)}/${GLOBAL_CONFIG_FILENAME}`;
	const globalConfigExists = yield* fs.exists(globalConfigPath);

	const stored = globalConfigExists
		? yield* loadConfigFromPath(globalConfigPath)
		: yield* createDefaultConfig(globalConfigPath);

	const resourcesDirectory = `${expandHome(GLOBAL_DATA_DIR)}/resources`;

	return {
		resourcesDirectory,
		resources: stored.resources,
		model: stored.model,
		provider: stored.provider
	} satisfies Config;
});
