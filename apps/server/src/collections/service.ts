import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Config } from '../config/index.ts';
import { Transaction } from '../context/transaction.ts';
import { CommonHints, getErrorHint, getErrorMessage } from '../errors.ts';
import { Metrics } from '../metrics/index.ts';
import { Resources } from '../resources/service.ts';
import { FS_RESOURCE_SYSTEM_NOTE, type BtcaFsResource } from '../resources/types.ts';
import { CollectionError, getCollectionKey, type CollectionResult } from './types.ts';

export namespace Collections {
	export type Service = {
		load: (args: {
			resourceNames: readonly string[];
			quiet?: boolean;
		}) => Promise<CollectionResult>;
	};

	const createCollectionInstructionBlock = (resource: BtcaFsResource): string => {
		const focusLines = resource.repoSubPaths.map(
			(subPath) => `Focus: ./${resource.fsName}/${subPath}`
		);
		const lines = [
			`## Resource: ${resource.name}`,
			FS_RESOURCE_SYSTEM_NOTE,
			`Path: ./${resource.fsName}`,
			...focusLines,
			resource.specialAgentInstructions ? `Notes: ${resource.specialAgentInstructions}` : ''
		].filter(Boolean);

		return lines.join('\n');
	};

	export const create = (args: {
		config: Config.Service;
		resources: Resources.Service;
	}): Service => {
		return {
			load: ({ resourceNames, quiet = false }) =>
				Transaction.run('collections.load', async () => {
					const uniqueNames = Array.from(new Set(resourceNames));
					if (uniqueNames.length === 0)
						throw new CollectionError({
							message: 'Cannot create collection with no resources',
							hint: `${CommonHints.LIST_RESOURCES} ${CommonHints.ADD_RESOURCE}`
						});

					Metrics.info('collections.load', { resources: uniqueNames, quiet });

					const sortedNames = [...uniqueNames].sort((a, b) => a.localeCompare(b));
					const key = getCollectionKey(sortedNames);
					const collectionPath = path.join(args.config.collectionsDirectory, key);

					try {
						await fs.mkdir(collectionPath, { recursive: true });
					} catch (cause) {
						throw new CollectionError({
							message: `Failed to create collection directory: "${collectionPath}"`,
							hint: 'Check that you have write permissions to the btca data directory.',
							cause
						});
					}

					const loadedResources: BtcaFsResource[] = [];
					for (const name of sortedNames) {
						try {
							loadedResources.push(await args.resources.load(name, { quiet }));
						} catch (cause) {
							// Preserve the hint from the underlying error if available
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
					}

					for (const resource of loadedResources) {
						let resourcePath: string;
						try {
							resourcePath = await resource.getAbsoluteDirectoryPath();
						} catch (cause) {
							throw new CollectionError({
								message: `Failed to get path for resource "${resource.name}"`,
								hint: CommonHints.CLEAR_CACHE,
								cause
							});
						}

						const linkPath = path.join(collectionPath, resource.fsName);
						try {
							await fs.rm(linkPath, { recursive: true, force: true });
						} catch {
							// ignore
						}

						try {
							await fs.symlink(resourcePath, linkPath, 'junction');
						} catch (cause) {
							throw new CollectionError({
								message: `Failed to create symlink for resource "${resource.name}"`,
								hint: 'This may be a filesystem permissions issue or the link already exists.',
								cause
							});
						}
					}

					const instructionBlocks = loadedResources.map(createCollectionInstructionBlock);

					return {
						path: collectionPath,
						agentInstructions: instructionBlocks.join('\n\n')
					};
				})
		};
	};
}
