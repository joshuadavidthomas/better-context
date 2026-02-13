import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Result } from 'better-result';

import { CommonHints } from '../../errors.ts';
import { ResourceError, resourceNameToKey } from '../helpers.ts';
import type { BtcaFsResource, BtcaNpmResourceArgs } from '../types.ts';

const ANONYMOUS_CLONE_DIR = '.tmp';
const NPM_INSTALL_STAGING_DIR = '.btca-install';
const NPM_CACHE_META_FILE = '.btca-npm-meta.json';
const NPM_CONTENT_FILE = 'npm-package.md';
const NPM_PAGE_FILE = 'npm-package-page.html';
const NPM_REGISTRY_HOST = 'https://registry.npmjs.org';

type NpmCacheMeta = {
	packageName: string;
	requestedVersion?: string;
	resolvedVersion: string;
	packageUrl: string;
	pageUrl: string;
	fetchedAt: string;
};

type NpmPackument = {
	readonly 'dist-tags'?: Record<string, string | undefined>;
	readonly versions?: Record<string, NpmPackageVersion | undefined>;
	readonly readme?: string;
};

type NpmPackageVersion = {
	readonly name?: string;
	readonly version?: string;
	readonly description?: string;
	readonly homepage?: string;
	readonly repository?: { url?: string } | string;
	readonly license?: string;
	readonly keywords?: readonly string[];
	readonly dependencies?: Record<string, string | undefined>;
	readonly peerDependencies?: Record<string, string | undefined>;
};

const cleanupDirectory = async (pathToRemove: string) => {
	await Result.tryPromise(() => fs.rm(pathToRemove, { recursive: true, force: true }));
};

const directoryExists = async (directoryPath: string) => {
	const result = await Result.tryPromise(() => fs.stat(directoryPath));
	return result.match({
		ok: (stat) => stat.isDirectory(),
		err: () => false
	});
};

const encodePackagePath = (packageName: string) =>
	packageName.split('/').map(encodeURIComponent).join('/');

const formatRepositoryUrl = (repository: NpmPackageVersion['repository']) => {
	if (!repository) return undefined;
	if (typeof repository === 'string') return repository;
	return repository.url;
};

const resolveRequestedVersion = (packument: NpmPackument, requestedVersion?: string) => {
	const versions = packument.versions ?? {};
	const distTags = packument['dist-tags'] ?? {};
	const requested = requestedVersion?.trim();

	if (!requested) {
		const latest = distTags.latest;
		if (latest && versions[latest]) return latest;
		return null;
	}

	if (versions[requested]) return requested;
	const tagged = distTags[requested];
	if (tagged && versions[tagged]) return tagged;
	return null;
};

const fetchJson = async <T>(url: string, resourceName: string): Promise<T> => {
	const response = await Result.tryPromise(() =>
		fetch(url, {
			headers: {
				accept: 'application/json'
			}
		})
	);

	if (!Result.isOk(response)) {
		throw new ResourceError({
			message: `Failed to fetch npm metadata for "${resourceName}"`,
			hint: CommonHints.CHECK_NETWORK,
			cause: response.error
		});
	}

	if (!response.value.ok) {
		throw new ResourceError({
			message: `Failed to fetch npm metadata for "${resourceName}" (${response.value.status})`,
			hint:
				response.value.status === 404
					? 'Check that the npm package exists.'
					: CommonHints.CHECK_NETWORK,
			cause: new Error(`Unexpected status ${response.value.status}`)
		});
	}

	const parsed = await Result.tryPromise(() => response.value.json() as Promise<T>);
	if (!Result.isOk(parsed)) {
		throw new ResourceError({
			message: `Failed to parse npm metadata for "${resourceName}"`,
			hint: 'Try again. If the issue persists, the npm registry may be returning malformed data.',
			cause: parsed.error
		});
	}

	return parsed.value;
};

const fetchText = async (url: string, resourceName: string) => {
	const fallbackContent = (reason: string) =>
		`<!-- npm package page unavailable for "${resourceName}" (${reason}) -->`;

	const response = await Result.tryPromise(() => fetch(url));
	if (!Result.isOk(response)) {
		return fallbackContent('request failed');
	}

	if (!response.value.ok) {
		return fallbackContent(`status ${response.value.status}`);
	}

	const textResult = await Result.tryPromise(() => response.value.text());
	if (!Result.isOk(textResult)) {
		return fallbackContent('response read failed');
	}

	return textResult.value;
};

const readProcessOutput = async (stream: ReadableStream<Uint8Array> | null) => {
	if (!stream) return '';
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const merged = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.length;
	}

	return new TextDecoder().decode(merged);
};

const runBunInstall = async (args: {
	installDirectory: string;
	packageName: string;
	resolvedVersion: string;
}) => {
	const packageSpec = `${args.packageName}@${args.resolvedVersion}`;
	const command = ['bun', 'add', '--exact', '--ignore-scripts', packageSpec];
	const process = Bun.spawn(command, {
		cwd: args.installDirectory,
		stdout: 'pipe',
		stderr: 'pipe'
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		readProcessOutput(process.stdout),
		readProcessOutput(process.stderr),
		process.exited
	]);

	if (exitCode !== 0) {
		const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
		throw new ResourceError({
			message: `Failed to install npm package "${packageSpec}"`,
			hint: 'Check that the package/version exists and your network can reach npm. Try "btca clear" and run again.',
			cause: new Error(
				details.length > 0
					? `bun add exited ${exitCode}: ${details}`
					: `bun add exited ${exitCode} with no output`
			)
		});
	}
};

const formatResourceOverview = (args: {
	packageName: string;
	resolvedVersion: string;
	requestedVersion?: string;
	packageUrl: string;
	pageUrl: string;
	versionData: NpmPackageVersion;
}) => {
	const dependencies = Object.entries(args.versionData.dependencies ?? {})
		.slice(0, 100)
		.map(([name, version]) => `- ${name}: ${version ?? 'unknown'}`)
		.join('\n');
	const peerDependencies = Object.entries(args.versionData.peerDependencies ?? {})
		.slice(0, 100)
		.map(([name, version]) => `- ${name}: ${version ?? 'unknown'}`)
		.join('\n');
	const repositoryUrl = formatRepositoryUrl(args.versionData.repository);

	return [
		`# npm package: ${args.packageName}`,
		'',
		`- Package URL: ${args.packageUrl}`,
		`- npm page: ${args.pageUrl}`,
		`- Version: ${args.resolvedVersion}`,
		args.requestedVersion
			? `- Requested version/tag: ${args.requestedVersion}`
			: '- Requested version/tag: latest',
		args.versionData.description ? `- Description: ${args.versionData.description}` : '',
		args.versionData.homepage ? `- Homepage: ${args.versionData.homepage}` : '',
		repositoryUrl ? `- Repository: ${repositoryUrl}` : '',
		args.versionData.license ? `- License: ${args.versionData.license}` : '',
		args.versionData.keywords?.length ? `- Keywords: ${args.versionData.keywords.join(', ')}` : '',
		'',
		'## Dependencies',
		dependencies || 'No dependencies listed.',
		'',
		'## Peer Dependencies',
		peerDependencies || 'No peer dependencies listed.'
	]
		.filter(Boolean)
		.join('\n');
};

const readCacheMeta = async (localPath: string): Promise<NpmCacheMeta | null> => {
	const result = await Result.gen(async function* () {
		const content = yield* Result.await(
			Result.tryPromise(() => Bun.file(path.join(localPath, NPM_CACHE_META_FILE)).text())
		);
		const parsed = yield* Result.try(() => JSON.parse(content) as NpmCacheMeta);
		return Result.ok(parsed);
	});

	return result.match({
		ok: (value) => value,
		err: () => null
	});
};

const shouldReuseCache = async (
	config: BtcaNpmResourceArgs,
	localPath: string
): Promise<boolean> => {
	if (!config.version || config.ephemeral) return false;
	const exists = await directoryExists(localPath);
	if (!exists) return false;

	const cached = await readCacheMeta(localPath);
	if (!cached) return false;
	return (
		cached.packageName === config.package &&
		cached.requestedVersion === config.version &&
		cached.resolvedVersion.length > 0
	);
};

const installPackageFiles = async (args: {
	localPath: string;
	packageName: string;
	resolvedVersion: string;
}) => {
	const installDirectory = path.join(args.localPath, NPM_INSTALL_STAGING_DIR);
	const packagePath = path.join(installDirectory, 'node_modules', ...args.packageName.split('/'));

	const createInstallDirectory = await Result.tryPromise(() =>
		fs.mkdir(installDirectory, { recursive: true })
	);
	if (!Result.isOk(createInstallDirectory)) {
		throw new ResourceError({
			message: `Failed to prepare npm install workspace for "${args.packageName}"`,
			hint: 'Check that the btca data directory is writable.',
			cause: createInstallDirectory.error
		});
	}

	const writeManifest = await Result.tryPromise(() =>
		Bun.write(
			path.join(installDirectory, 'package.json'),
			JSON.stringify(
				{
					name: 'btca-npm-resource-install',
					private: true
				},
				null,
				2
			)
		)
	);
	if (!Result.isOk(writeManifest)) {
		throw new ResourceError({
			message: `Failed to prepare npm install workspace for "${args.packageName}"`,
			hint: 'Check that the btca data directory is writable.',
			cause: writeManifest.error
		});
	}

	try {
		await runBunInstall({
			installDirectory,
			packageName: args.packageName,
			resolvedVersion: args.resolvedVersion
		});

		const hasInstalledPackage = await directoryExists(packagePath);
		if (!hasInstalledPackage) {
			throw new ResourceError({
				message: `Installed npm package directory is missing for "${args.packageName}@${args.resolvedVersion}"`,
				hint: 'Try again. If this keeps happening, the package may not publish source files.'
			});
		}

		const copyResult = await Result.tryPromise(() =>
			fs.cp(packagePath, args.localPath, { recursive: true, force: true })
		);
		if (!Result.isOk(copyResult)) {
			throw new ResourceError({
				message: `Failed to copy installed npm package files for "${args.packageName}"`,
				hint: 'Check filesystem permissions and available disk space.',
				cause: copyResult.error
			});
		}
	} finally {
		await cleanupDirectory(installDirectory);
	}
};

const writeNpmMetadataFiles = async (args: {
	localPath: string;
	packageName: string;
	requestedVersion?: string;
	resolvedVersion: string;
	versionData: NpmPackageVersion;
	packageUrl: string;
	pageUrl: string;
	pageHtml: string;
}) => {
	const overview = formatResourceOverview({
		packageName: args.packageName,
		resolvedVersion: args.resolvedVersion,
		...(args.requestedVersion ? { requestedVersion: args.requestedVersion } : {}),
		packageUrl: args.packageUrl,
		pageUrl: args.pageUrl,
		versionData: args.versionData
	});
	const meta: NpmCacheMeta = {
		packageName: args.packageName,
		...(args.requestedVersion ? { requestedVersion: args.requestedVersion } : {}),
		resolvedVersion: args.resolvedVersion,
		packageUrl: args.packageUrl,
		pageUrl: args.pageUrl,
		fetchedAt: new Date().toISOString()
	};

	await Promise.all([
		Bun.write(path.join(args.localPath, NPM_CONTENT_FILE), overview),
		Bun.write(path.join(args.localPath, NPM_PAGE_FILE), args.pageHtml),
		Bun.write(path.join(args.localPath, NPM_CACHE_META_FILE), JSON.stringify(meta, null, 2))
	]);
};

const hydrateNpmResource = async (config: BtcaNpmResourceArgs, localPath: string) => {
	const packagePath = encodePackagePath(config.package);
	const registryUrl = `${NPM_REGISTRY_HOST}/${encodeURIComponent(config.package)}`;
	const requestedVersion = config.version?.trim();
	const packument = await fetchJson<NpmPackument>(registryUrl, config.name);
	const resolvedVersion = resolveRequestedVersion(packument, requestedVersion);

	if (!resolvedVersion) {
		throw new ResourceError({
			message: `Unable to resolve npm version for package "${config.package}"`,
			hint: requestedVersion
				? `Version/tag "${requestedVersion}" was not found. Try a valid version or tag like "latest".`
				: 'The package does not expose a resolvable latest version.'
		});
	}

	const versionData = packument.versions?.[resolvedVersion];
	if (!versionData) {
		throw new ResourceError({
			message: `NPM package metadata for "${config.package}@${resolvedVersion}" is missing`,
			hint: 'Try another version or run the command again.'
		});
	}

	const packageUrl = `https://www.npmjs.com/package/${packagePath}`;
	const pageUrl = `${packageUrl}/v/${encodeURIComponent(resolvedVersion)}`;
	const pageHtml = await fetchText(pageUrl, config.name);

	await installPackageFiles({
		localPath,
		packageName: config.package,
		resolvedVersion
	});

	await writeNpmMetadataFiles({
		localPath,
		packageName: config.package,
		...(requestedVersion ? { requestedVersion } : {}),
		resolvedVersion,
		versionData,
		packageUrl,
		pageUrl,
		pageHtml
	});
};

const ensureNpmResource = async (config: BtcaNpmResourceArgs): Promise<string> => {
	const resourceKey = config.localDirectoryKey ?? resourceNameToKey(config.name);
	const basePath = config.ephemeral
		? path.join(config.resourcesDirectoryPath, ANONYMOUS_CLONE_DIR)
		: config.resourcesDirectoryPath;
	const localPath = path.join(basePath, resourceKey);

	const mkdirResult = await Result.tryPromise({
		try: () => fs.mkdir(basePath, { recursive: true }),
		catch: (cause) =>
			new ResourceError({
				message: 'Failed to create resources directory',
				hint: 'Check that you have write permissions to the btca data directory.',
				cause
			})
	});
	if (!Result.isOk(mkdirResult)) throw mkdirResult.error;

	const canReuse = await shouldReuseCache(config, localPath);
	if (canReuse) return localPath;

	await cleanupDirectory(localPath);
	const createResult = await Result.tryPromise(() => fs.mkdir(localPath, { recursive: true }));
	if (!Result.isOk(createResult)) {
		throw new ResourceError({
			message: `Failed to prepare npm resource directory for "${config.name}"`,
			hint: 'Check that the btca data directory is writable.',
			cause: createResult.error
		});
	}

	await hydrateNpmResource(config, localPath);
	return localPath;
};

const sanitizeNpmCitationSegment = (value: string) =>
	value
		.trim()
		.replace(/\//g, '__')
		.replace(/[^a-zA-Z0-9._@+-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

const getNpmFsName = (config: BtcaNpmResourceArgs) => {
	if (!config.ephemeral || !config.name.startsWith('anonymous:npm:')) {
		return resourceNameToKey(config.name);
	}

	const packageSegment = sanitizeNpmCitationSegment(config.package);
	const versionSegment = sanitizeNpmCitationSegment(config.version ?? 'latest');
	return `npm:${packageSegment}@${versionSegment}`;
};

export const loadNpmResource = async (config: BtcaNpmResourceArgs): Promise<BtcaFsResource> => {
	const localPath = await ensureNpmResource(config);
	const cleanup = config.ephemeral
		? async () => {
				await cleanupDirectory(localPath);
			}
		: undefined;

	return {
		_tag: 'fs-based',
		name: config.name,
		fsName: getNpmFsName(config),
		type: 'npm',
		repoSubPaths: [],
		specialAgentInstructions: config.specialAgentInstructions,
		getAbsoluteDirectoryPath: async () => localPath,
		...(cleanup ? { cleanup } : {})
	};
};
