import { describe, it, expect } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { executeGlobTool } from '../tools/glob.ts';
import { executeGrepTool } from '../tools/grep.ts';
import { executeListTool } from '../tools/list.ts';
import { executeReadTool } from '../tools/read.ts';
import {
	createVirtualFs,
	disposeVirtualFs,
	existsInVirtualFs,
	importDirectoryIntoVirtualFs,
	listVirtualFsFilesRecursive,
	mkdirVirtualFs,
	readVirtualFsFile,
	readdirVirtualFs,
	rmVirtualFs,
	statVirtualFs,
	writeVirtualFsFile
} from './virtual-fs.ts';

const posix = path.posix;

const createRoot = () => `/vfs-test-${randomUUID()}`;

const cleanupVirtual = async (root: string, vfsId?: string) => {
	try {
		await rmVirtualFs(root, { recursive: true, force: true }, vfsId);
	} catch {
		// ignore cleanup failures
	}
};

describe('VirtualFs (just-bash)', () => {
	it('supports basic in-memory file operations', async () => {
		const root = createRoot();
		const vfsId = createVirtualFs();
		try {
			const dir = posix.join(root, 'dir');
			const file = posix.join(dir, 'hello.txt');

			await mkdirVirtualFs(dir, { recursive: true }, vfsId);
			await writeVirtualFsFile(file, 'Hello virtual', vfsId);

			const text = await readVirtualFsFile(file, vfsId);
			expect(text).toBe('Hello virtual');

			const fileStat = await statVirtualFs(file, vfsId);
			expect(fileStat.isFile).toBe(true);

			const dirStat = await statVirtualFs(dir, vfsId);
			expect(dirStat.isDirectory).toBe(true);

			const entries = await readdirVirtualFs(dir, vfsId);
			expect(entries.some((entry) => entry.name === 'hello.txt')).toBe(true);

			const files = await listVirtualFsFilesRecursive(root, vfsId);
			expect(files).toContain(file);
		} finally {
			await cleanupVirtual(root, vfsId);
			disposeVirtualFs(vfsId);
		}
	});

	it('imports from disk and works with virtual tools', async () => {
		const root = createRoot();
		const vfsId = createVirtualFs();
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

			await mkdirVirtualFs(collectionPath, { recursive: true }, vfsId);

			await importDirectoryIntoVirtualFs({
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

			expect(await existsInVirtualFs(posix.join(resourcePath, 'README.md'), vfsId)).toBe(true);
			expect(await existsInVirtualFs(posix.join(resourcePath, '.git', 'HEAD'), vfsId)).toBe(false);

			const context = { basePath: collectionPath, vfsId };

			const listResult = await executeListTool({ path: '.' }, context);
			expect(listResult.metadata.entries.some((entry) => entry.name === resourceName)).toBe(true);

			const readResult = await executeReadTool({ path: `${resourceName}/README.md` }, context);
			expect(readResult.output).toContain('needle');

			const globResult = await executeGlobTool({ pattern: '**/*.ts' }, context);
			expect(globResult.output.split('\n')).toContain(`${resourceName}/src/index.ts`);

			const grepResult = await executeGrepTool({ pattern: 'needle' }, context);
			expect(grepResult.output).toContain(`${resourceName}/README.md`);
		} finally {
			await cleanupVirtual(root, vfsId);
			await fs.rm(sourceDir, { recursive: true, force: true });
			disposeVirtualFs(vfsId);
		}
	});
});
