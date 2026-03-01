import path from 'node:path';

import { Effect } from 'effect';

import type { ConfigService as ConfigServiceShape } from '../config/index.ts';
import { runTransaction } from '../context/transaction.ts';
import { CommonHints, getErrorHint, getErrorMessage } from '../errors.ts';
import { metricsInfo } from '../metrics/index.ts';
import type { ResourcesService } from '../resources/service.ts';
import { isGitResource, isNpmResource } from '../resources/schema.ts';
import { FS_RESOURCE_SYSTEM_NOTE, type BtcaFsResource } from '../resources/types.ts';
import { parseNpmReference } from '../validation/index.ts';
import { CollectionError, getCollectionKey, type CollectionResult } from './types.ts';
import {
	createVirtualFs,
	disposeVirtualFs,
	importDirectoryIntoVirtualFs,
	mkdirVirtualFs,
	rmVirtualFs
} from '../vfs/virtual-fs.ts';
import {
	clearVirtualCollectionMetadata,
	setVirtualCollectionMetadata,
	type VirtualResourceMetadata
} from './virtual-metadata.ts';

export type CollectionsService = {
	load: (args: { resourceNames: readonly string[]; quiet?: boolean }) => Promise<CollectionResult>;
	loadEffect: (args: {
		resourceNames: readonly string[];
		quiet?: boolean;
	}) => Effect.Effect<CollectionResult, CollectionError>;
};

const encodePathSegments = (value: string) => value.split('/').map(encodeURIComponent).join('/');

const trimGitSuffix = (url: string) => url.replace(/\.git$/u, '').replace(/\/+$/u, '');
const getNpmCitationAlias = (metadata?: VirtualResourceMetadata) => {
	if (!metadata?.package) return undefined;
	return `npm:${metadata.package}@${metadata.version ?? 'latest'}`;
};

const createCollectionInstructionBlock = (
	resource: BtcaFsResource,
	metadata?: VirtualResourceMetadata
): string => {
	const focusLines = resource.repoSubPaths.map(
		(subPath) => `Focus: ./${resource.fsName}/${subPath}`
	);
	const gitRef = metadata?.branch ?? metadata?.commit;
	const githubPrefix =
		resource.type === 'git' && metadata?.url && gitRef
			? `${trimGitSuffix(metadata.url)}/blob/${encodeURIComponent(gitRef)}`
			: undefined;
	const npmCitationAlias = resource.type === 'npm' ? getNpmCitationAlias(metadata) : undefined;
	const lines = [
		`## Resource: ${resource.name}`,
		FS_RESOURCE_SYSTEM_NOTE,
		`Path: ./${resource.fsName}`,
		resource.type === 'git' && metadata?.url ? `Repo URL: ${trimGitSuffix(metadata.url)}` : '',
		resource.type === 'git' && metadata?.branch ? `Repo Branch: ${metadata.branch}` : '',
		resource.type === 'git' && metadata?.commit ? `Repo Commit: ${metadata.commit}` : '',
		resource.type === 'npm' && metadata?.package ? `NPM Package: ${metadata.package}` : '',
		resource.type === 'npm' && metadata?.version ? `NPM Version: ${metadata.version}` : '',
		resource.type === 'npm' && metadata?.url ? `NPM URL: ${metadata.url}` : '',
		npmCitationAlias ? `NPM Citation Alias: ${npmCitationAlias}` : '',
		githubPrefix ? `GitHub Blob Prefix: ${githubPrefix}` : '',
		githubPrefix
			? `GitHub Citation Rule: Convert virtual paths under ./${resource.fsName}/ to repo-relative paths, then encode each path segment for GitHub URLs (example segment: "+page.server.js" -> "${encodeURIComponent('+page.server.js')}").`
			: '',
		githubPrefix
			? `GitHub Citation Example: ${githubPrefix}/${encodePathSegments('src/routes/blog/+page.server.js')}`
			: '',
		resource.type !== 'git'
			? 'Citation Rule: Cite local file paths only for this resource (no GitHub URL).'
			: '',
		npmCitationAlias
			? `NPM Citation Rule: In "Sources", cite npm files using "${npmCitationAlias}/<file>" (for example, "${npmCitationAlias}/README.md"). Do not cite encoded virtual folder names.`
			: '',
		...focusLines,
		resource.specialAgentInstructions ? `Notes: ${resource.specialAgentInstructions}` : ''
	].filter(Boolean);

	return lines.join('\n');
};

const ignoreErrors = async (action: () => Promise<unknown>) => {
	try {
		await action();
	} catch {
		return;
	}
};

const initVirtualRoot = async (collectionPath: string, vfsId: string) => {
	try {
		await mkdirVirtualFs(collectionPath, { recursive: true }, vfsId);
	} catch (cause) {
		throw new CollectionError({
			message: `Failed to initialize virtual collection root: "${collectionPath}"`,
			hint: 'Check that the virtual filesystem is available.',
			cause
		});
	}
};

const loadResource = async (resources: ResourcesService, name: string, quiet: boolean) => {
	try {
		return await resources.load(name, { quiet });
	} catch (cause) {
		const underlyingHint = getErrorHint(cause);
		const underlyingMessage = getErrorMessage(cause);
		throw new CollectionError({
			message: `Failed to load resource "${name}": ${underlyingMessage}`,
			hint:
				underlyingHint ??
				`${CommonHints.CLEAR_CACHE} Check that the resource "${name}" is correctly configured.`,
			cause
		});
	}
};

const resolveResourcePath = async (resource: BtcaFsResource) => {
	try {
		return await resource.getAbsoluteDirectoryPath();
	} catch (cause) {
		throw new CollectionError({
			message: `Failed to get path for resource "${resource.name}"`,
			hint: CommonHints.CLEAR_CACHE,
			cause
		});
	}
};

const virtualizeResource = async (args: {
	resource: BtcaFsResource;
	resourcePath: string;
	virtualResourcePath: string;
	vfsId: string;
}) => {
	try {
		await importDirectoryIntoVirtualFs({
			sourcePath: args.resourcePath,
			destinationPath: args.virtualResourcePath,
			vfsId: args.vfsId,
			ignore: (relativePath) => {
				const normalized = relativePath.split(path.sep).join('/');
				return (
					normalized === '.git' || normalized.startsWith('.git/') || normalized.includes('/.git/')
				);
			}
		});
	} catch (cause) {
		throw new CollectionError({
			message: `Failed to virtualize resource "${args.resource.name}"`,
			hint: CommonHints.CLEAR_CACHE,
			cause
		});
	}
};

const getGitHeadHash = async (resourcePath: string) => {
	try {
		const proc = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
			cwd: resourcePath,
			stdout: 'pipe',
			stderr: 'pipe'
		});
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) return undefined;
		const trimmed = stdout.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	} catch {
		return undefined;
	}
};

const getGitHeadBranch = async (resourcePath: string) => {
	try {
		const proc = Bun.spawn(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
			cwd: resourcePath,
			stdout: 'pipe',
			stderr: 'pipe'
		});
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) return undefined;
		const trimmed = stdout.trim();
		if (!trimmed || trimmed === 'HEAD') return undefined;
		return trimmed;
	} catch {
		return undefined;
	}
};

const ANON_PREFIX = 'anonymous:';
const getAnonymousUrlFromName = (name: string) =>
	name.startsWith(ANON_PREFIX) ? name.slice(ANON_PREFIX.length) : undefined;
const NPM_ANON_PREFIX = `${ANON_PREFIX}npm:`;
const NPM_META_FILE = '.btca-npm-meta.json';
const getAnonymousNpmReferenceFromName = (name: string) =>
	name.startsWith(NPM_ANON_PREFIX) ? name.slice(ANON_PREFIX.length) : undefined;

const readNpmMeta = async (resourcePath: string) => {
	try {
		const content = await Bun.file(path.join(resourcePath, NPM_META_FILE)).text();
		return JSON.parse(content) as {
			packageName?: string;
			resolvedVersion?: string;
			packageUrl?: string;
		};
	} catch {
		return null;
	}
};

const buildVirtualMetadata = async (args: {
	resource: BtcaFsResource;
	resourcePath: string;
	loadedAt: string;
	definition?: ReturnType<ConfigServiceShape['getResource']>;
}) => {
	const base = {
		name: args.resource.name,
		fsName: args.resource.fsName,
		type: args.resource.type,
		path: args.resourcePath,
		repoSubPaths: args.resource.repoSubPaths,
		loadedAt: args.loadedAt
	};

	if (args.resource.type === 'npm') {
		const configuredDefinition =
			args.definition && isNpmResource(args.definition) ? args.definition : null;
		const anonymousReference = getAnonymousNpmReferenceFromName(args.resource.name);
		const anonymousNpm = anonymousReference ? parseNpmReference(anonymousReference) : null;
		const cached = await readNpmMeta(args.resourcePath);
		const packageName =
			configuredDefinition?.package ?? cached?.packageName ?? anonymousNpm?.packageName;
		const version =
			configuredDefinition?.version ?? cached?.resolvedVersion ?? anonymousNpm?.version;
		const url = cached?.packageUrl ?? anonymousNpm?.packageUrl;

		return {
			...base,
			...(packageName ? { package: packageName } : {}),
			...(version ? { version } : {}),
			...(url ? { url } : {})
		};
	}

	if (args.resource.type !== 'git') return base;

	const configuredDefinition =
		args.definition && isGitResource(args.definition) ? args.definition : null;
	const url = configuredDefinition?.url ?? getAnonymousUrlFromName(args.resource.name);
	const branch = configuredDefinition?.branch ?? (await getGitHeadBranch(args.resourcePath));
	const commit = await getGitHeadHash(args.resourcePath);

	return {
		...base,
		...(url ? { url } : {}),
		...(branch ? { branch } : {}),
		...(commit ? { commit } : {})
	};
};

export const createCollectionsService = (args: {
	config: ConfigServiceShape;
	resources: ResourcesService;
}): CollectionsService => {
	const load: CollectionsService['load'] = ({ resourceNames, quiet = false }) =>
		runTransaction('collections.load', async () => {
			const uniqueNames = Array.from(new Set(resourceNames));
			if (uniqueNames.length === 0)
				throw new CollectionError({
					message: 'Cannot create collection with no resources',
					hint: `${CommonHints.LIST_RESOURCES} ${CommonHints.ADD_RESOURCE}`
				});

			metricsInfo('collections.load', { resources: uniqueNames, quiet });

			const sortedNames = [...uniqueNames].sort((a, b) => a.localeCompare(b));
			const key = getCollectionKey(sortedNames);
			const collectionPath = '/';
			const vfsId = createVirtualFs();
			const cleanupVirtual = () => {
				disposeVirtualFs(vfsId);
				clearVirtualCollectionMetadata(vfsId);
			};
			const cleanupResources = (resources: BtcaFsResource[]) =>
				Promise.all(
					resources.map(async (resource) => {
						if (!resource.cleanup) return;
						await ignoreErrors(() => resource.cleanup!());
					})
				);

			const loadedResources: BtcaFsResource[] = [];

			try {
				await initVirtualRoot(collectionPath, vfsId);

				for (const name of sortedNames) {
					const resource = await loadResource(args.resources, name, quiet);
					loadedResources.push(resource);
				}

				const metadataResources: VirtualResourceMetadata[] = [];
				const loadedAt = new Date().toISOString();
				for (const resource of loadedResources) {
					const resourcePath = await resolveResourcePath(resource);
					const virtualResourcePath = path.posix.join('/', resource.fsName);

					await ignoreErrors(() =>
						rmVirtualFs(virtualResourcePath, { recursive: true, force: true }, vfsId)
					);

					await virtualizeResource({
						resource,
						resourcePath,
						virtualResourcePath,
						vfsId
					});

					const definition = args.config.getResource(resource.name);
					const metadata = await buildVirtualMetadata({
						resource,
						resourcePath,
						loadedAt,
						definition
					});
					if (metadata) metadataResources.push(metadata);
				}

				setVirtualCollectionMetadata({
					vfsId,
					collectionKey: key,
					createdAt: loadedAt,
					resources: metadataResources
				});

				const metadataByName = new Map(
					metadataResources.map((resource) => [resource.name, resource])
				);
				const instructionBlocks = loadedResources.map((resource) =>
					createCollectionInstructionBlock(resource, metadataByName.get(resource.name))
				);

				return {
					path: collectionPath,
					agentInstructions: instructionBlocks.join('\n\n'),
					vfsId,
					cleanup: async () => {
						await cleanupResources(loadedResources);
					}
				};
			} catch (cause) {
				cleanupVirtual();
				await cleanupResources(loadedResources);
				if (cause instanceof CollectionError) throw cause;
				throw new CollectionError({
					message: 'Failed to load resource collection',
					hint: CommonHints.CLEAR_CACHE,
					cause
				});
			}
		});

	const loadEffect: CollectionsService['loadEffect'] = ({ resourceNames, quiet }) =>
		Effect.tryPromise({
			try: () => load({ resourceNames, quiet }),
			catch: (cause) =>
				cause instanceof CollectionError
					? cause
					: new CollectionError({
							message: 'Failed to load resource collection',
							hint: CommonHints.CLEAR_CACHE,
							cause
						})
		});

	return {
		load,
		loadEffect
	};
};
