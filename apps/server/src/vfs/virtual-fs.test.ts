import { describe, it, expect } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GlobTool } from '../tools/glob.ts';
import { GrepTool } from '../tools/grep.ts';
import { ListTool } from '../tools/list.ts';
import { ReadTool } from '../tools/read.ts';
import { VirtualFs } from './virtual-fs.ts';

const posix = path.posix;

const createRoot = () => `/vfs-test-${randomUUID()}`;

const cleanupVirtual = async (root: string) => {
	try {
		await VirtualFs.rm(root, { recursive: true, force: true });
	} catch {
		// ignore cleanup failures
	}
};

describe('VirtualFs (just-bash)', () => {
	it('supports basic in-memory file operations', async () => {
		const root = createRoot();
		try {
			const dir = posix.join(root, 'dir');
			const file = posix.join(dir, 'hello.txt');

			await VirtualFs.mkdir(dir, { recursive: true });
			await VirtualFs.writeFile(file, 'Hello virtual');

			const text = await VirtualFs.readFile(file);
			expect(text).toBe('Hello virtual');

			const fileStat = await VirtualFs.stat(file);
			expect(fileStat.isFile).toBe(true);

			const dirStat = await VirtualFs.stat(dir);
			expect(dirStat.isDirectory).toBe(true);

			const entries = await VirtualFs.readdir(dir);
			expect(entries.some((entry) => entry.name === 'hello.txt')).toBe(true);

			const files = await VirtualFs.listFilesRecursive(root);
			expect(files).toContain(file);
		} finally {
			await cleanupVirtual(root);
		}
	});

	it('imports from disk and works with virtual tools', async () => {
		const root = createRoot();
		const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'btca-just-bash-'));
		try {
			const resourceName = `repo-${randomUUID()}`;
			const collectionName = `collection-${randomUUID()}`;
			const resourcePath = posix.join(root, 'resources', resourceName);
			const collectionPath = posix.join(root, 'collections', collectionName);
			const linkPath = posix.join(collectionPath, resourceName);

			await fs.mkdir(path.join(sourceDir, 'src'), { recursive: true });
			await fs.writeFile(path.join(sourceDir, 'README.md'), 'Virtual README\nneedle');
			await fs.writeFile(path.join(sourceDir, 'src', 'index.ts'), 'export const needle = "found";');
			await fs.mkdir(path.join(sourceDir, '.git'), { recursive: true });
			await fs.writeFile(path.join(sourceDir, '.git', 'HEAD'), 'ref: refs/heads/main');

			await VirtualFs.mkdir(posix.join(root, 'resources'), { recursive: true });
			await VirtualFs.mkdir(posix.join(root, 'collections'), { recursive: true });
			await VirtualFs.mkdir(collectionPath, { recursive: true });

			await VirtualFs.importDirectoryFromDisk({
				sourcePath: sourceDir,
				destinationPath: resourcePath,
				ignore: (relativePath) => {
					const normalized = relativePath.split(path.sep).join('/');
					return (
						normalized === '.git' || normalized.startsWith('.git/') || normalized.includes('/.git/')
					);
				}
			});

			expect(await VirtualFs.exists(posix.join(resourcePath, 'README.md'))).toBe(true);
			expect(await VirtualFs.exists(posix.join(resourcePath, '.git', 'HEAD'))).toBe(false);

			await VirtualFs.symlink(resourcePath, linkPath);

			const context = { basePath: collectionPath, mode: 'virtual' as const };

			const listResult = await ListTool.execute({ path: '.' }, context);
			expect(listResult.metadata.entries.some((entry) => entry.name === resourceName)).toBe(true);

			const readResult = await ReadTool.execute({ path: `${resourceName}/README.md` }, context);
			expect(readResult.output).toContain('needle');

			const globResult = await GlobTool.execute({ pattern: '**/*.ts' }, context);
			expect(globResult.output.split('\n')).toContain(`${resourceName}/src/index.ts`);

			const grepResult = await GrepTool.execute({ pattern: 'needle' }, context);
			expect(grepResult.output).toContain(`${resourceName}/README.md`);
		} finally {
			await cleanupVirtual(root);
			await fs.rm(sourceDir, { recursive: true, force: true });
		}
	});
});
