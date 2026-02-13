import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Result } from 'better-result';

import { loadNpmResource } from './npm.ts';
import type { BtcaNpmResourceArgs } from '../types.ts';

const streamFromString = (value: string) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			if (value.length > 0) controller.enqueue(new TextEncoder().encode(value));
			controller.close();
		}
	});

const parsePackageSpec = (value: string) => {
	const splitIndex = value.lastIndexOf('@');
	if (splitIndex <= 0 || splitIndex === value.length - 1) {
		return { packageName: value, version: '0.0.0' };
	}
	return {
		packageName: value.slice(0, splitIndex),
		version: value.slice(splitIndex + 1)
	};
};

const createInstallSpawnMock = (args?: { exitCode?: number; stdout?: string; stderr?: string }) =>
	((...spawnArgs: Parameters<typeof Bun.spawn>) => {
		const [command, options] = spawnArgs;
		const commandArgs = Array.isArray(command) ? command : [command];
		const packageSpec = commandArgs.at(-1) ?? '';
		const { packageName, version } = parsePackageSpec(packageSpec);
		const cwd = options?.cwd;

		if ((args?.exitCode ?? 0) === 0 && cwd) {
			const packageDirectory = path.join(cwd, 'node_modules', ...packageName.split('/'));
			mkdirSync(path.join(packageDirectory, 'src'), { recursive: true });
			const title = packageName === 'react' ? 'React' : packageName;
			writeFileSync(path.join(packageDirectory, 'README.md'), `# ${title}\n\nInstalled for btca`);
			writeFileSync(
				path.join(packageDirectory, 'package.json'),
				JSON.stringify({ name: packageName, version }, null, 2)
			);
			writeFileSync(
				path.join(packageDirectory, 'src', 'runtime.js'),
				`export const rune = '$state';`
			);
		}

		return {
			stdout: streamFromString(args?.stdout ?? ''),
			stderr: streamFromString(args?.stderr ?? ''),
			exited: Promise.resolve(args?.exitCode ?? 0)
		} as unknown as ReturnType<typeof Bun.spawn>;
	}) as typeof Bun.spawn;

describe('NPM Resource', () => {
	let testDir: string;
	let originalFetch: typeof fetch;
	let originalSpawn: typeof Bun.spawn;

	beforeEach(async () => {
		testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'btca-npm-test-'));
		originalFetch = globalThis.fetch;
		originalSpawn = Bun.spawn;
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		Bun.spawn = originalSpawn;
		await fs.rm(testDir, { recursive: true, force: true });
	});

	it('hydrates an npm package into a filesystem resource', async () => {
		Bun.spawn = createInstallSpawnMock();
		globalThis.fetch = (async (input) => {
			const url = String(input);
			if (url.startsWith('https://registry.npmjs.org/react')) {
				return new Response(
					JSON.stringify({
						'dist-tags': { latest: '19.0.0' },
						versions: {
							'19.0.0': {
								name: 'react',
								version: '19.0.0',
								description: 'React',
								readme: '# React\n\nDocs'
							}
						}
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			if (url.startsWith('https://www.npmjs.com/package/react/v/19.0.0')) {
				return new Response('<html><title>react</title></html>', { status: 200 });
			}
			return new Response('not found', { status: 404 });
		}) as typeof fetch;

		const args: BtcaNpmResourceArgs = {
			type: 'npm',
			name: 'react-docs',
			package: 'react',
			resourcesDirectoryPath: testDir,
			specialAgentInstructions: 'Use this for React questions'
		};

		const resource = await loadNpmResource(args);
		expect(resource._tag).toBe('fs-based');
		expect(resource.type).toBe('npm');
		expect(resource.repoSubPaths).toEqual([]);

		const resourcePath = await resource.getAbsoluteDirectoryPath();
		expect(resourcePath).toBe(path.join(testDir, 'react-docs'));

		const readme = await Bun.file(path.join(resourcePath, 'README.md')).text();
		expect(readme).toContain('# React');
		const runtimeFile = await Bun.file(path.join(resourcePath, 'src', 'runtime.js')).text();
		expect(runtimeFile).toContain(`'$state'`);

		const packagePage = await Bun.file(path.join(resourcePath, 'npm-package-page.html')).text();
		expect(packagePage).toContain('<title>react</title>');
	});

	it('reuses cached pinned versions without refetching', async () => {
		let fetchCalls = 0;
		let spawnCalls = 0;
		const installSpawnMock = createInstallSpawnMock();
		Bun.spawn = ((...spawnArgs: Parameters<typeof Bun.spawn>) => {
			spawnCalls += 1;
			return installSpawnMock(...spawnArgs);
		}) as typeof Bun.spawn;
		globalThis.fetch = (async (input) => {
			fetchCalls += 1;
			const url = String(input);
			if (url.startsWith('https://registry.npmjs.org/%40types%2Fnode')) {
				return new Response(
					JSON.stringify({
						'dist-tags': { latest: '22.10.1' },
						versions: {
							'22.10.1': {
								name: '@types/node',
								version: '22.10.1',
								readme: '# @types/node'
							}
						}
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			if (url.startsWith('https://www.npmjs.com/package/%40types/node/v/22.10.1')) {
				return new Response('<html><title>@types/node</title></html>', { status: 200 });
			}
			return new Response('not found', { status: 404 });
		}) as typeof fetch;

		const args: BtcaNpmResourceArgs = {
			type: 'npm',
			name: 'node-types',
			package: '@types/node',
			version: '22.10.1',
			resourcesDirectoryPath: testDir,
			specialAgentInstructions: ''
		};

		await loadNpmResource(args);
		const firstFetchCalls = fetchCalls;
		const firstSpawnCalls = spawnCalls;
		await loadNpmResource(args);
		expect(fetchCalls).toBe(firstFetchCalls);
		expect(spawnCalls).toBe(firstSpawnCalls);
	});

	it('adds cleanup for anonymous npm resources', async () => {
		Bun.spawn = createInstallSpawnMock();
		globalThis.fetch = (async (input) => {
			const url = String(input);
			if (url.startsWith('https://registry.npmjs.org/react')) {
				return new Response(
					JSON.stringify({
						'dist-tags': { latest: '19.0.0' },
						versions: {
							'19.0.0': { name: 'react', version: '19.0.0', readme: '# React' }
						}
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			if (url.startsWith('https://www.npmjs.com/package/react/v/19.0.0')) {
				return new Response('<html><title>react</title></html>', { status: 200 });
			}
			return new Response('not found', { status: 404 });
		}) as typeof fetch;

		const args: BtcaNpmResourceArgs = {
			type: 'npm',
			name: 'anonymous:npm:react',
			package: 'react',
			resourcesDirectoryPath: testDir,
			specialAgentInstructions: '',
			ephemeral: true,
			localDirectoryKey: 'anonymous-react'
		};

		const resource = await loadNpmResource(args);
		expect(resource.cleanup).toBeDefined();

		const resourcePath = await resource.getAbsoluteDirectoryPath();
		const existsBefore = await Result.tryPromise(() => fs.stat(resourcePath));
		expect(existsBefore.isOk()).toBe(true);

		await resource.cleanup?.();
		const existsAfter = await Result.tryPromise(() => fs.stat(resourcePath));
		expect(existsAfter.isOk()).toBe(false);
	});

	it('uses readable fsName aliases for anonymous npm resources', async () => {
		Bun.spawn = createInstallSpawnMock();
		globalThis.fetch = (async (input) => {
			const url = String(input);
			if (url.startsWith('https://registry.npmjs.org/%40types%2Fnode')) {
				return new Response(
					JSON.stringify({
						'dist-tags': { latest: '22.10.1' },
						versions: {
							'22.10.1': { name: '@types/node', version: '22.10.1', readme: '# @types/node' }
						}
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			if (url.startsWith('https://www.npmjs.com/package/%40types/node/v/22.10.1')) {
				return new Response('<html><title>@types/node</title></html>', { status: 200 });
			}
			return new Response('not found', { status: 404 });
		}) as typeof fetch;

		const args: BtcaNpmResourceArgs = {
			type: 'npm',
			name: 'anonymous:npm:@types/node@22.10.1',
			package: '@types/node',
			version: '22.10.1',
			resourcesDirectoryPath: testDir,
			specialAgentInstructions: '',
			ephemeral: true,
			localDirectoryKey: 'anonymous-types-node'
		};

		const resource = await loadNpmResource(args);
		expect(resource.fsName).toBe('npm:@types__node@22.10.1');
		expect(resource.fsName.includes('%3A')).toBe(false);
		expect(resource.fsName.includes('%2F')).toBe(false);
	});

	it('continues when npm package page fetch is unavailable', async () => {
		Bun.spawn = createInstallSpawnMock();
		globalThis.fetch = (async (input) => {
			const url = String(input);
			if (url.startsWith('https://registry.npmjs.org/react')) {
				return new Response(
					JSON.stringify({
						'dist-tags': { latest: '19.0.0' },
						versions: {
							'19.0.0': {
								name: 'react',
								version: '19.0.0',
								description: 'React'
							}
						}
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			if (url.startsWith('https://www.npmjs.com/package/react/v/19.0.0')) {
				return new Response('blocked', { status: 403 });
			}
			return new Response('not found', { status: 404 });
		}) as typeof fetch;

		const args: BtcaNpmResourceArgs = {
			type: 'npm',
			name: 'react-docs',
			package: 'react',
			resourcesDirectoryPath: testDir,
			specialAgentInstructions: ''
		};

		const resource = await loadNpmResource(args);
		const resourcePath = await resource.getAbsoluteDirectoryPath();
		const packagePage = await Bun.file(path.join(resourcePath, 'npm-package-page.html')).text();
		expect(packagePage).toContain('npm package page unavailable');
	});

	it('returns a clear install error when bun install fails', async () => {
		Bun.spawn = createInstallSpawnMock({
			exitCode: 1,
			stderr: 'error: package not found'
		});
		globalThis.fetch = (async (input) => {
			const url = String(input);
			if (url.startsWith('https://registry.npmjs.org/react')) {
				return new Response(
					JSON.stringify({
						'dist-tags': { latest: '19.0.0' },
						versions: {
							'19.0.0': {
								name: 'react',
								version: '19.0.0',
								description: 'React'
							}
						}
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			if (url.startsWith('https://www.npmjs.com/package/react/v/19.0.0')) {
				return new Response('<html><title>react</title></html>', { status: 200 });
			}
			return new Response('not found', { status: 404 });
		}) as typeof fetch;

		const args: BtcaNpmResourceArgs = {
			type: 'npm',
			name: 'react-docs',
			package: 'react',
			resourcesDirectoryPath: testDir,
			specialAgentInstructions: ''
		};

		await expect(loadNpmResource(args)).rejects.toThrow(
			'Failed to install npm package "react@19.0.0"'
		);
	});
});
