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

const cleanupVirtual = async (root: string, vfsId?: string) => {
	try {
		await VirtualFs.rm(root, { recursive: true, force: true }, vfsId);
	} catch {
		// ignore cleanup failures
	}
};

describe('VirtualFs (just-bash)', () => {
	it('supports basic in-memory file operations', async () => {
		const root = createRoot();
		const vfsId = VirtualFs.create();
		try {
			const dir = posix.join(root, 'dir');
			const file = posix.join(dir, 'hello.txt');

			await VirtualFs.mkdir(dir, { recursive: true }, vfsId);
			await VirtualFs.writeFile(file, 'Hello virtual', vfsId);

			const text = await VirtualFs.readFile(file, vfsId);
			expect(text).toBe('Hello virtual');

			const fileStat = await VirtualFs.stat(file, vfsId);
			expect(fileStat.isFile).toBe(true);

			const dirStat = await VirtualFs.stat(dir, vfsId);
			expect(dirStat.isDirectory).toBe(true);

			const entries = await VirtualFs.readdir(dir, vfsId);
			expect(entries.some((entry) => entry.name === 'hello.txt')).toBe(true);

			const files = await VirtualFs.listFilesRecursive(root, vfsId);
			expect(files).toContain(file);
		} finally {
			await cleanupVirtual(root, vfsId);
			VirtualFs.dispose(vfsId);
		}
	});

	it('imports from disk and works with virtual tools', async () => {
		const root = createRoot();
		const vfsId = VirtualFs.create();
		const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'btca-just-bash-'));
		try {
			const resourceName = `repo-${randomUUID()}`;
			const collectionPath = root;
			const resourcePath = posix.join(collectionPath, resourceName);

			await fs.mkdir(path.join(sourceDir, 'src'), { recursive: true });
			await fs.writeFile(path.join(sourceDir, 'README.md'), 'Virtual README\nneedle');
			await fs.writeFile(path.join(sourceDir, 'src', 'index.ts'), 'export const needle = "found";');
			await fs.mkdir(path.join(sourceDir, '.git'), { recursive: true });
			await fs.writeFile(path.join(sourceDir, '.git', 'HEAD'), 'ref: refs/heads/main');

			await VirtualFs.mkdir(collectionPath, { recursive: true }, vfsId);

			await VirtualFs.importDirectoryFromDisk({
				sourcePath: sourceDir,
				destinationPath: resourcePath,
				vfsId,
				ignore: (relativePath) => {
					const normalized = relativePath.split(path.sep).join('/');
					return (
						normalized === '.git' || normalized.startsWith('.git/') || normalized.includes('/.git/')
					);
				}
			});

			expect(await VirtualFs.exists(posix.join(resourcePath, 'README.md'), vfsId)).toBe(true);
			expect(await VirtualFs.exists(posix.join(resourcePath, '.git', 'HEAD'), vfsId)).toBe(false);

			const context = { basePath: collectionPath, vfsId };

			const listResult = await ListTool.execute({ path: '.' }, context);
			expect(listResult.metadata.entries.some((entry) => entry.name === resourceName)).toBe(true);

			const readResult = await ReadTool.execute({ path: `${resourceName}/README.md` }, context);
			expect(readResult.output).toContain('needle');

			const globResult = await GlobTool.execute({ pattern: '**/*.ts' }, context);
			expect(globResult.output.split('\n')).toContain(`${resourceName}/src/index.ts`);

			const grepResult = await GrepTool.execute({ pattern: 'needle' }, context);
			expect(grepResult.output).toContain(`${resourceName}/README.md`);
		} finally {
			await cleanupVirtual(root, vfsId);
			await fs.rm(sourceDir, { recursive: true, force: true });
			VirtualFs.dispose(vfsId);
		}
	});
});
