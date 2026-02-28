import * as path from 'node:path';

import { VirtualFs } from '../vfs/virtual-fs.ts';

const posix = path.posix;

export class PathEscapeError extends Error {
	readonly _tag = 'PathEscapeError';
	readonly requestedPath: string;
	readonly basePath: string;

	constructor(requestedPath: string, basePath: string) {
		super(`Path "${requestedPath}" is outside the allowed directory "${basePath}". Access denied.`);
		this.requestedPath = requestedPath;
		this.basePath = basePath;
	}
}

export class PathNotFoundError extends Error {
	readonly _tag = 'PathNotFoundError';
	readonly requestedPath: string;

	constructor(requestedPath: string) {
		super(`Path "${requestedPath}" does not exist.`);
		this.requestedPath = requestedPath;
	}
}

export const resolveSandboxPath = (basePath: string, requestedPath: string): string => {
	const normalizedBase = posix.resolve('/', basePath);
	const resolved = posix.isAbsolute(requestedPath)
		? posix.resolve(requestedPath)
		: posix.resolve(normalizedBase, requestedPath);
	const normalized = posix.normalize(resolved);
	const relative = posix.relative(normalizedBase, normalized);

	if (relative.startsWith('..') || posix.isAbsolute(relative)) {
		throw new PathEscapeError(requestedPath, basePath);
	}

	return normalized;
};

export const resolveSandboxPathWithSymlinks = async (
	basePath: string,
	requestedPath: string,
	vfsId?: string
) => {
	const resolved = resolveSandboxPath(basePath, requestedPath);
	try {
		return await VirtualFs.realpath(resolved, vfsId);
	} catch {
		return resolved;
	}
};

export const sandboxPathExists = async (basePath: string, requestedPath: string, vfsId?: string) => {
	try {
		const resolved = resolveSandboxPath(basePath, requestedPath);
		return await VirtualFs.exists(resolved, vfsId);
	} catch {
		return false;
	}
};

export const sandboxPathIsDirectory = async (
	basePath: string,
	requestedPath: string,
	vfsId?: string
) => {
	try {
		const resolved = resolveSandboxPath(basePath, requestedPath);
		const stats = await VirtualFs.stat(resolved, vfsId);
		return stats.isDirectory;
	} catch {
		return false;
	}
};

export const sandboxPathIsFile = async (basePath: string, requestedPath: string, vfsId?: string) => {
	try {
		const resolved = resolveSandboxPath(basePath, requestedPath);
		const stats = await VirtualFs.stat(resolved, vfsId);
		return stats.isFile;
	} catch {
		return false;
	}
};

export const validateSandboxPath = async (
	basePath: string,
	requestedPath: string,
	vfsId?: string
) => {
	const resolved = resolveSandboxPath(basePath, requestedPath);
	if (!(await VirtualFs.exists(resolved, vfsId))) {
		throw new PathNotFoundError(requestedPath);
	}
	return resolved;
};

export const getSandboxRelativePath = (basePath: string, resolvedPath: string): string =>
	posix.relative(basePath, resolvedPath);

export const VirtualSandbox = {
	PathEscapeError,
	PathNotFoundError,
	resolvePath: resolveSandboxPath,
	resolvePathWithSymlinks: resolveSandboxPathWithSymlinks,
	exists: sandboxPathExists,
	isDirectory: sandboxPathIsDirectory,
	isFile: sandboxPathIsFile,
	validatePath: validateSandboxPath,
	getRelativePath: getSandboxRelativePath
} as const;
