import { createHash } from 'node:crypto';

import { Config } from '../config/index.ts';
import { parseNpmReference, validateGitUrl } from '../validation/index.ts';
import { CommonHints } from '../errors.ts';

import { ResourceError, resourceNameToKey } from './helpers.ts';
import { loadGitResource } from './impls/git.ts';
import { loadNpmResource } from './impls/npm.ts';
import {
	isGitResource,
	isNpmResource,
	type ResourceDefinition,
	type GitResource,
	type LocalResource,
	type NpmResource
} from './schema.ts';
import type {
	BtcaFsResource,
	BtcaGitResourceArgs,
	BtcaLocalResourceArgs,
	BtcaNpmResourceArgs
} from './types.ts';

const ANON_PREFIX = 'anonymous:';
const ANON_DIRECTORY_PREFIX = 'anonymous-';
const DEFAULT_ANON_BRANCH = 'main';

export const createAnonymousDirectoryKey = (reference: string): string => {
	const hash = createHash('sha256').update(reference).digest('hex').slice(0, 12);
	return `${ANON_DIRECTORY_PREFIX}${hash}`;
};

const isAnonymousResource = (name: string): boolean => name.startsWith(ANON_PREFIX);

export namespace Resources {
	export type Service = {
		load: (
			name: string,
			options?: {
				quiet?: boolean;
			}
		) => Promise<BtcaFsResource>;
	};

	const normalizeSearchPaths = (definition: GitResource): string[] => {
		const paths = [
			...(definition.searchPaths ?? []),
			...(definition.searchPath ? [definition.searchPath] : [])
		];
		return paths.filter((path) => path.trim().length > 0);
	};

	const definitionToGitArgs = (
		definition: GitResource,
		resourcesDirectory: string,
		quiet: boolean
	): BtcaGitResourceArgs => ({
		type: 'git',
		name: definition.name,
		url: definition.url,
		branch: definition.branch,
		repoSubPaths: normalizeSearchPaths(definition),
		resourcesDirectoryPath: resourcesDirectory,
		specialAgentInstructions: definition.specialNotes ?? '',
		quiet,
		ephemeral: isAnonymousResource(definition.name),
		localDirectoryKey: isAnonymousResource(definition.name)
			? createAnonymousDirectoryKey(definition.url)
			: undefined
	});

	const definitionToLocalArgs = (definition: LocalResource): BtcaLocalResourceArgs => ({
		type: 'local',
		name: definition.name,
		path: definition.path,
		specialAgentInstructions: definition.specialNotes ?? ''
	});

	const definitionToNpmArgs = (
		definition: NpmResource,
		resourcesDirectory: string
	): BtcaNpmResourceArgs => {
		const reference = `${definition.package}${definition.version ? `@${definition.version}` : ''}`;
		return {
			type: 'npm',
			name: definition.name,
			package: definition.package,
			...(definition.version ? { version: definition.version } : {}),
			resourcesDirectoryPath: resourcesDirectory,
			specialAgentInstructions: definition.specialNotes ?? '',
			ephemeral: isAnonymousResource(definition.name),
			localDirectoryKey: isAnonymousResource(definition.name)
				? createAnonymousDirectoryKey(reference)
				: undefined
		};
	};

	const loadLocalResource = (args: BtcaLocalResourceArgs): BtcaFsResource => ({
		_tag: 'fs-based',
		name: args.name,
		fsName: resourceNameToKey(args.name),
		type: 'local',
		repoSubPaths: [],
		specialAgentInstructions: args.specialAgentInstructions,
		getAbsoluteDirectoryPath: async () => args.path
	});

	export const createAnonymousResource = (reference: string): ResourceDefinition | null => {
		const npmReference = parseNpmReference(reference);
		if (npmReference) {
			return {
				type: 'npm',
				name: `${ANON_PREFIX}${npmReference.normalizedReference}`,
				package: npmReference.packageName,
				...(npmReference.version ? { version: npmReference.version } : {})
			};
		}

		const gitUrlResult = validateGitUrl(reference);
		if (gitUrlResult.valid) {
			const normalizedUrl = gitUrlResult.value;
			return {
				type: 'git',
				name: `${ANON_PREFIX}${normalizedUrl}`,
				url: normalizedUrl,
				branch: DEFAULT_ANON_BRANCH
			};
		}
		return null;
	};

	export const resolveResourceDefinition = (
		reference: string,
		getResource: Config.Service['getResource']
	): ResourceDefinition => {
		const definition = getResource(reference);
		if (definition) return definition;

		const anonymousDefinition = createAnonymousResource(reference);
		if (anonymousDefinition) return anonymousDefinition;

		throw new ResourceError({
			message: `Resource "${reference}" not found in config`,
			hint: `${CommonHints.LIST_RESOURCES} ${CommonHints.ADD_RESOURCE}`
		});
	};

	export const create = (config: Config.Service): Service => {
		return {
			load: async (name, options) => {
				const quiet = options?.quiet ?? false;
				const definition = resolveResourceDefinition(name, config.getResource);

				if (isGitResource(definition)) {
					return loadGitResource(definitionToGitArgs(definition, config.resourcesDirectory, quiet));
				}

				if (isNpmResource(definition)) {
					return loadNpmResource(definitionToNpmArgs(definition, config.resourcesDirectory));
				}

				return loadLocalResource(definitionToLocalArgs(definition));
			}
		};
	};
}
