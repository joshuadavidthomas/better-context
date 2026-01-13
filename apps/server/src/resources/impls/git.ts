import { promises as fs } from 'node:fs';

import { Metrics } from '../../metrics/index.ts';
import { CommonHints } from '../../errors.ts';
import { ResourceError } from '../helpers.ts';
import type { BtcaFsResource, BtcaGitResourceArgs } from '../types.ts';

const isValidGitUrl = (url: string) => /^https:\/\//.test(url);
const isValidBranch = (branch: string) => /^[\w\-./]+$/.test(branch);
const isValidPath = (path: string) => !path.includes('..') && /^[\w\-./]*$/.test(path);

const directoryExists = async (path: string): Promise<boolean> => {
	try {
		const stat = await fs.stat(path);
		return stat.isDirectory();
	} catch {
		return false;
	}
};

/**
 * Git error patterns and their user-friendly messages.
 */
const GitErrorPatterns = {
	// Branch not found errors
	BRANCH_NOT_FOUND: [
		/couldn't find remote ref/i,
		/Remote branch .* not found/i,
		/fatal: invalid refspec/i,
		/error: pathspec .* did not match any/i
	],
	// Repository not found
	REPO_NOT_FOUND: [
		/Repository not found/i,
		/remote: Repository not found/i,
		/fatal: repository .* not found/i,
		/ERROR: Repository not found/i
	],
	// Authentication/Permission errors
	AUTH_REQUIRED: [
		/Authentication failed/i,
		/could not read Username/i,
		/Permission denied/i,
		/fatal: Authentication failed/i,
		/remote: HTTP Basic: Access denied/i,
		/The requested URL returned error: 403/i
	],
	// Network errors
	NETWORK_ERROR: [
		/Could not resolve host/i,
		/Connection refused/i,
		/Network is unreachable/i,
		/Unable to access/i,
		/Failed to connect/i,
		/Connection timed out/i,
		/SSL certificate problem/i
	],
	// Rate limiting
	RATE_LIMITED: [/rate limit exceeded/i, /too many requests/i, /API rate limit/i]
} as const;

type GitErrorType = keyof typeof GitErrorPatterns;

/**
 * Detect the type of git error from stderr output.
 */
const detectGitErrorType = (stderr: string): GitErrorType | null => {
	for (const [errorType, patterns] of Object.entries(GitErrorPatterns)) {
		for (const pattern of patterns) {
			if (pattern.test(stderr)) {
				return errorType as GitErrorType;
			}
		}
	}
	return null;
};

/**
 * Get a user-friendly error message and hint based on git error type.
 */
const getGitErrorDetails = (
	errorType: GitErrorType | null,
	context: { operation: string; branch?: string; url?: string }
): { message: string; hint: string } => {
	switch (errorType) {
		case 'BRANCH_NOT_FOUND':
			return {
				message: context.branch
					? `Branch "${context.branch}" not found in the repository`
					: 'The specified branch was not found',
				hint: `${CommonHints.CHECK_BRANCH} You can check available branches at ${context.url ?? 'the repository URL'}.`
			};

		case 'REPO_NOT_FOUND':
			return {
				message: 'Repository not found',
				hint: `${CommonHints.CHECK_URL} If this is a private repository, ${CommonHints.CHECK_PERMISSIONS.toLowerCase()}`
			};

		case 'AUTH_REQUIRED':
			return {
				message: 'Authentication required or access denied',
				hint: CommonHints.CHECK_PERMISSIONS
			};

		case 'NETWORK_ERROR':
			return {
				message: `Network error during git ${context.operation}`,
				hint: CommonHints.CHECK_NETWORK
			};

		case 'RATE_LIMITED':
			return {
				message: 'Rate limit exceeded',
				hint: 'Wait a few minutes before trying again, or authenticate to increase your rate limit.'
			};

		default:
			return {
				message: `git ${context.operation} failed`,
				hint: `${CommonHints.CLEAR_CACHE} If the problem persists, verify your repository configuration.`
			};
	}
};

interface GitRunResult {
	exitCode: number;
	stderr: string;
}

const runGit = async (
	args: string[],
	options: { cwd?: string; quiet: boolean }
): Promise<GitRunResult> => {
	// Always capture stderr for error detection, but stdout can be ignored
	const proc = Bun.spawn(['git', ...args], {
		cwd: options.cwd,
		stdout: options.quiet ? 'ignore' : 'inherit',
		stderr: 'pipe'
	});

	const stderrChunks: Uint8Array[] = [];
	const reader = proc.stderr.getReader();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) stderrChunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const exitCode = await proc.exited;
	const totalLength = stderrChunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const combined = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of stderrChunks) {
		combined.set(chunk, offset);
		offset += chunk.length;
	}
	const stderr = new TextDecoder().decode(combined);

	// Log stderr to console if not quiet and there's content
	if (!options.quiet && stderr.trim()) {
		console.error(stderr);
	}

	return { exitCode, stderr };
};

const gitClone = async (args: {
	repoUrl: string;
	repoBranch: string;
	repoSubPath: string;
	localAbsolutePath: string;
	quiet: boolean;
}) => {
	if (!isValidGitUrl(args.repoUrl)) {
		throw new ResourceError({
			message: 'Invalid git URL format',
			hint: 'URLs must start with "https://". Example: https://github.com/user/repo',
			cause: new Error('URL validation failed')
		});
	}
	if (!isValidBranch(args.repoBranch)) {
		throw new ResourceError({
			message: `Invalid branch name: "${args.repoBranch}"`,
			hint: 'Branch names can only contain letters, numbers, hyphens, underscores, dots, and forward slashes.',
			cause: new Error('Branch validation failed')
		});
	}
	if (args.repoSubPath && !isValidPath(args.repoSubPath)) {
		throw new ResourceError({
			message: `Invalid search path: "${args.repoSubPath}"`,
			hint: 'Search paths cannot contain ".." (path traversal) and must use only safe characters.',
			cause: new Error('Path validation failed')
		});
	}

	const needsSparseCheckout = args.repoSubPath && args.repoSubPath !== '/';
	const cloneArgs = needsSparseCheckout
		? [
				'clone',
				'--filter=blob:none',
				'--no-checkout',
				'--sparse',
				'-b',
				args.repoBranch,
				args.repoUrl,
				args.localAbsolutePath
			]
		: ['clone', '--depth', '1', '-b', args.repoBranch, args.repoUrl, args.localAbsolutePath];

	const result = await runGit(cloneArgs, { quiet: args.quiet });

	if (result.exitCode !== 0) {
		const errorType = detectGitErrorType(result.stderr);
		const { message, hint } = getGitErrorDetails(errorType, {
			operation: 'clone',
			branch: args.repoBranch,
			url: args.repoUrl
		});

		throw new ResourceError({
			message,
			hint,
			cause: new Error(`git clone failed with exit code ${result.exitCode}: ${result.stderr}`)
		});
	}

	if (needsSparseCheckout) {
		const sparseResult = await runGit(['sparse-checkout', 'set', args.repoSubPath], {
			cwd: args.localAbsolutePath,
			quiet: args.quiet
		});

		if (sparseResult.exitCode !== 0) {
			throw new ResourceError({
				message: `Failed to set sparse-checkout path: "${args.repoSubPath}"`,
				hint: 'Verify the search path exists in the repository. Check the repository structure to find the correct path.',
				cause: new Error(
					`git sparse-checkout failed with exit code ${sparseResult.exitCode}: ${sparseResult.stderr}`
				)
			});
		}

		const checkoutResult = await runGit(['checkout'], {
			cwd: args.localAbsolutePath,
			quiet: args.quiet
		});

		if (checkoutResult.exitCode !== 0) {
			throw new ResourceError({
				message: 'Failed to checkout repository',
				hint: CommonHints.CLEAR_CACHE,
				cause: new Error(
					`git checkout failed with exit code ${checkoutResult.exitCode}: ${checkoutResult.stderr}`
				)
			});
		}
	}
};

const gitUpdate = async (args: { localAbsolutePath: string; branch: string; quiet: boolean }) => {
	const fetchResult = await runGit(['fetch', '--depth', '1', 'origin', args.branch], {
		cwd: args.localAbsolutePath,
		quiet: args.quiet
	});

	if (fetchResult.exitCode !== 0) {
		const errorType = detectGitErrorType(fetchResult.stderr);
		const { message, hint } = getGitErrorDetails(errorType, {
			operation: 'fetch',
			branch: args.branch
		});

		throw new ResourceError({
			message,
			hint,
			cause: new Error(
				`git fetch failed with exit code ${fetchResult.exitCode}: ${fetchResult.stderr}`
			)
		});
	}

	const resetResult = await runGit(['reset', '--hard', `origin/${args.branch}`], {
		cwd: args.localAbsolutePath,
		quiet: args.quiet
	});

	if (resetResult.exitCode !== 0) {
		throw new ResourceError({
			message: 'Failed to update local repository',
			hint: `${CommonHints.CLEAR_CACHE} This will re-clone the repository from scratch.`,
			cause: new Error(
				`git reset failed with exit code ${resetResult.exitCode}: ${resetResult.stderr}`
			)
		});
	}
};

const ensureGitResource = async (config: BtcaGitResourceArgs): Promise<string> => {
	const localPath = `${config.resourcesDirectoryPath}/${config.name}`;

	return Metrics.span(
		'resource.git.ensure',
		async () => {
			const exists = await directoryExists(localPath);

			if (exists) {
				Metrics.info('resource.git.update', {
					name: config.name,
					branch: config.branch,
					repoSubPath: config.repoSubPath
				});
				await gitUpdate({
					localAbsolutePath: localPath,
					branch: config.branch,
					quiet: config.quiet
				});
				return localPath;
			}

			Metrics.info('resource.git.clone', {
				name: config.name,
				branch: config.branch,
				repoSubPath: config.repoSubPath
			});

			try {
				await fs.mkdir(config.resourcesDirectoryPath, { recursive: true });
			} catch (cause) {
				throw new ResourceError({
					message: 'Failed to create resources directory',
					hint: 'Check that you have write permissions to the btca data directory.',
					cause
				});
			}

			await gitClone({
				repoUrl: config.url,
				repoBranch: config.branch,
				repoSubPath: config.repoSubPath,
				localAbsolutePath: localPath,
				quiet: config.quiet
			});

			return localPath;
		},
		{ resource: config.name }
	);
};

export const loadGitResource = async (config: BtcaGitResourceArgs): Promise<BtcaFsResource> => {
	const localPath = await ensureGitResource(config);
	return {
		_tag: 'fs-based',
		name: config.name,
		type: 'git',
		repoSubPath: config.repoSubPath,
		specialAgentInstructions: config.specialAgentInstructions,
		getAbsoluteDirectoryPath: async () => localPath
	};
};
