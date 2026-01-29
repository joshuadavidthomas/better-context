import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import * as path from 'node:path';

import { InMemoryFs } from 'just-bash';

const posix = path.posix;

export type VfsStat = {
	isFile: boolean;
	isDirectory: boolean;
	size: number;
	mtimeMs: number;
};

export type VfsDirEntry = {
	name: string;
	isFile: boolean;
	isDirectory: boolean;
};

type MaybeStat = {
	isFile?: (() => boolean) | boolean;
	isDirectory?: (() => boolean) | boolean;
	size?: number;
	mtime?: Date;
	mtimeMs?: number;
};

export namespace VirtualFs {
	const defaultId = 'default';
	const instances = new Map<string, InMemoryFs>([[defaultId, new InMemoryFs()]]);

	const getInstance = (vfsId?: string) => {
		const key = vfsId ?? defaultId;
		const existing = instances.get(key);
		if (existing) return existing;
		const created = new InMemoryFs();
		instances.set(key, created);
		return created;
	};

	const normalize = (filePath: string): string => {
		const resolved = posix.resolve('/', filePath);
		return resolved === '' ? '/' : resolved;
	};

	const toStat = (stat: MaybeStat): VfsStat => {
		const isFile = typeof stat.isFile === 'function' ? stat.isFile() : Boolean(stat.isFile);
		const isDirectory =
			typeof stat.isDirectory === 'function' ? stat.isDirectory() : Boolean(stat.isDirectory);
		const mtimeMs =
			typeof stat.mtimeMs === 'number'
				? stat.mtimeMs
				: stat.mtime instanceof Date
					? stat.mtime.getTime()
					: 0;
		return {
			isFile,
			isDirectory,
			size: stat.size ?? 0,
			mtimeMs
		};
	};

	export const create = () => {
		const vfsId = randomUUID();
		instances.set(vfsId, new InMemoryFs());
		return vfsId;
	};

	export const has = (vfsId?: string) => {
		const key = vfsId ?? defaultId;
		return instances.has(key);
	};

	export const reset = (vfsId?: string) => {
		const key = vfsId ?? defaultId;
		instances.set(key, new InMemoryFs());
	};

	export const dispose = (vfsId?: string) => {
		const key = vfsId ?? defaultId;
		instances.delete(key);
	};

	export const disposeAll = () => {
		instances.clear();
		instances.set(defaultId, new InMemoryFs());
	};

	export function resolve(filePath: string): string {
		return normalize(filePath);
	}

	export async function mkdir(filePath: string, options?: { recursive?: boolean }, vfsId?: string) {
		await getInstance(vfsId).mkdir(normalize(filePath), options);
	}

	export async function rm(
		filePath: string,
		options?: { recursive?: boolean; force?: boolean },
		vfsId?: string
	) {
		await getInstance(vfsId).rm(normalize(filePath), options);
	}

	export async function exists(filePath: string, vfsId?: string) {
		try {
			await getInstance(vfsId).stat(normalize(filePath));
			return true;
		} catch {
			return false;
		}
	}

	export async function stat(filePath: string, vfsId?: string) {
		const stats = (await getInstance(vfsId).stat(normalize(filePath))) as MaybeStat;
		return toStat(stats);
	}

	export async function readdir(filePath: string, vfsId?: string) {
		const resolved = await realpath(filePath, vfsId).catch(() => normalize(filePath));
		const entries = (await getInstance(vfsId).readdir(resolved)) as string[];
		const result: VfsDirEntry[] = [];
		for (const name of entries) {
			const entryPath = normalize(posix.join(filePath, name));
			let entryStat: VfsStat | null = null;
			try {
				entryStat = await stat(entryPath, vfsId);
			} catch {
				entryStat = null;
			}
			result.push({
				name,
				isFile: entryStat?.isFile ?? false,
				isDirectory: entryStat?.isDirectory ?? false
			});
		}
		return result;
	}

	export async function readFile(filePath: string, vfsId?: string) {
		return getInstance(vfsId).readFile(normalize(filePath));
	}

	export async function readFileBuffer(filePath: string, vfsId?: string) {
		return getInstance(vfsId).readFileBuffer(normalize(filePath));
	}

	export async function writeFile(filePath: string, data: string | Uint8Array, vfsId?: string) {
		await getInstance(vfsId).writeFile(normalize(filePath), data);
	}

	export async function symlink(targetPath: string, linkPath: string, vfsId?: string) {
		const target = posix.isAbsolute(targetPath) ? normalize(targetPath) : targetPath;
		await getInstance(vfsId).symlink(target, normalize(linkPath));
	}

	export async function realpath(filePath: string, vfsId?: string) {
		const resolved = normalize(filePath);
		const maybe = getInstance(vfsId) as unknown as {
			realpath?: (path: string) => Promise<string>;
		};
		if (typeof maybe.realpath === 'function') {
			return maybe.realpath(resolved);
		}
		return resolved;
	}

	export async function listFilesRecursive(rootPath: string, vfsId?: string) {
		const files: string[] = [];
		const stack: string[] = [normalize(rootPath)];

		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) continue;
			let entries: VfsDirEntry[] = [];
			try {
				entries = await readdir(current, vfsId);
			} catch {
				continue;
			}

			for (const entry of entries) {
				const entryPath = normalize(posix.join(current, entry.name));
				if (entry.isDirectory) {
					stack.push(entryPath);
				} else if (entry.isFile) {
					files.push(entryPath);
				}
			}
		}

		return files;
	}

	export async function importDirectoryFromDisk(args: {
		sourcePath: string;
		destinationPath: string;
		ignore?: (relativePath: string) => boolean;
		vfsId?: string;
	}) {
		const base = path.resolve(args.sourcePath);
		const dest = normalize(args.destinationPath);
		const ignore = args.ignore ?? (() => false);
		const vfsId = args.vfsId;

		const walk = async (currentPath: string): Promise<void> => {
			const relative = path.relative(base, currentPath);
			if (relative && ignore(relative)) return;
			let dirents: Dirent[] = [];
			try {
				dirents = await fs.readdir(currentPath, { withFileTypes: true });
			} catch {
				return;
			}

			for (const dirent of dirents) {
				const srcPath = path.join(currentPath, dirent.name);
				const relPath = path.relative(base, srcPath);
				if (ignore(relPath)) continue;
				const destPath = normalize(posix.join(dest, relPath.split(path.sep).join('/')));

				if (dirent.isDirectory()) {
					await mkdir(destPath, { recursive: true }, vfsId);
					await walk(srcPath);
					continue;
				}

				if (dirent.isSymbolicLink()) {
					try {
						const target = await fs.readlink(srcPath);
						await symlink(target, destPath, vfsId);
					} catch {
						// Ignore broken symlinks
					}
					continue;
				}

				if (dirent.isFile()) {
					try {
						const buffer = await fs.readFile(srcPath);
						await writeFile(destPath, buffer, vfsId);
					} catch {
						// Skip unreadable files
					}
				}
			}
		};

		await mkdir(dest, { recursive: true }, vfsId);
		await walk(base);
	}
}
