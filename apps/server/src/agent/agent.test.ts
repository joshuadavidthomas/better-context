import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { Agent } from './service.ts';
import { Config } from '../config/index.ts';
import type { CollectionResult } from '../collections/types.ts';
import {
	getVirtualCollectionMetadata,
	setVirtualCollectionMetadata
} from '../collections/virtual-metadata.ts';
import { VirtualFs } from '../vfs/virtual-fs.ts';

describe('Agent', () => {
	let testDir: string;
	let originalCwd: string;
	let originalHome: string | undefined;

	beforeEach(async () => {
		testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'btca-agent-test-'));
		originalCwd = process.cwd();
		originalHome = process.env.HOME;
		process.env.HOME = testDir;
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		process.env.HOME = originalHome;
		await fs.rm(testDir, { recursive: true, force: true });
	});

	describe('Agent.create', () => {
		it('creates an agent service with ask and askStream methods', async () => {
			process.chdir(testDir);
			const config = await Config.load();
			const agent = Agent.create(config);

			expect(agent).toBeDefined();
			expect(typeof agent.ask).toBe('function');
			expect(typeof agent.askStream).toBe('function');
		});
	});

	// Integration tests - require valid OpenCode credentials and provider
	// Run with: BTCA_RUN_INTEGRATION_TESTS=1 bun test
	describe.skipIf(!process.env.BTCA_RUN_INTEGRATION_TESTS)('Agent.ask (integration)', () => {
		it('asks a question and receives an answer', async () => {
			process.chdir(testDir);
			const config = await Config.load();
			const agent = Agent.create(config);

			const vfsId = VirtualFs.create();
			await VirtualFs.mkdir('/', { recursive: true }, vfsId);
			await VirtualFs.writeFile(
				'/README.md',
				'# Test Documentation\n\nThis is a test file. The answer to life is 42.',
				vfsId
			);

			const collection: CollectionResult = {
				path: '/',
				agentInstructions: 'This is a test collection with a README file.',
				vfsId
			};

			const result = await agent.ask({
				collection,
				question: 'What number is the answer to life according to the README?'
			});

			expect(result).toBeDefined();
			expect(result.answer).toBeDefined();
			expect(typeof result.answer).toBe('string');
			expect(result.answer.length).toBeGreaterThan(0);
			expect(result.model).toBeDefined();
			expect(result.model.provider).toBeDefined();
			expect(result.model.model).toBeDefined();
			expect(result.events).toBeDefined();
			expect(Array.isArray(result.events)).toBe(true);
		}, 60000);

		it('handles askStream and receives events', async () => {
			process.chdir(testDir);
			const config = await Config.load();
			const agent = Agent.create(config);

			const vfsId = VirtualFs.create();
			await VirtualFs.mkdir('/', { recursive: true }, vfsId);
			await VirtualFs.writeFile('/data.txt', 'The capital of France is Paris.', vfsId);

			const collection: CollectionResult = {
				path: '/',
				agentInstructions: 'Simple test collection.',
				vfsId
			};

			const { stream, model } = await agent.askStream({
				collection,
				question: 'What is the capital of France according to the data file?'
			});

			expect(model).toBeDefined();
			expect(model.provider).toBeDefined();
			expect(model.model).toBeDefined();

			const events = [];
			for await (const event of stream) {
				events.push(event);
			}

			expect(events.length).toBeGreaterThan(0);
			// Should have received some text-delta events
			const textEvents = events.filter((e) => e.type === 'text-delta');
			expect(textEvents.length).toBeGreaterThan(0);
		}, 60000);

		it('cleans up virtual collections after ask', async () => {
			process.chdir(testDir);
			const config = await Config.load();
			const agent = Agent.create(config);

			const vfsId = VirtualFs.create();
			await VirtualFs.mkdir('/', { recursive: true }, vfsId);
			await VirtualFs.mkdir('/docs', { recursive: true }, vfsId);
			await VirtualFs.writeFile('/docs/README.md', 'Virtual README\nThe answer is 42.', vfsId);

			setVirtualCollectionMetadata({
				vfsId,
				collectionKey: 'virtual-test',
				createdAt: new Date().toISOString(),
				resources: [
					{
						name: 'docs',
						fsName: 'docs',
						type: 'local',
						path: '/docs',
						repoSubPaths: [],
						loadedAt: new Date().toISOString()
					}
				]
			});

			const collection: CollectionResult = {
				path: '/',
				agentInstructions: 'This is a virtual collection with a README file.',
				vfsId
			};

			const result = await agent.ask({
				collection,
				question: 'What number is the answer according to the README?'
			});

			expect(result).toBeDefined();
			expect(VirtualFs.has(vfsId)).toBe(false);
			expect(getVirtualCollectionMetadata(vfsId)).toBeUndefined();
		}, 60000);

		it('cleans up virtual collections after askStream', async () => {
			process.chdir(testDir);
			const config = await Config.load();
			const agent = Agent.create(config);

			const vfsId = VirtualFs.create();
			await VirtualFs.mkdir('/', { recursive: true }, vfsId);
			await VirtualFs.mkdir('/docs', { recursive: true }, vfsId);
			await VirtualFs.writeFile(
				'/docs/README.md',
				'Virtual README\nThe capital of France is Paris.',
				vfsId
			);

			setVirtualCollectionMetadata({
				vfsId,
				collectionKey: 'virtual-stream-test',
				createdAt: new Date().toISOString(),
				resources: [
					{
						name: 'docs',
						fsName: 'docs',
						type: 'local',
						path: '/docs',
						repoSubPaths: [],
						loadedAt: new Date().toISOString()
					}
				]
			});

			const collection: CollectionResult = {
				path: '/',
				agentInstructions: 'This is a virtual collection with a README file.',
				vfsId
			};

			const { stream } = await agent.askStream({
				collection,
				question: 'What is the capital of France according to the README?'
			});

			for await (const _event of stream) {
				// drain stream to trigger cleanup
			}

			expect(VirtualFs.has(vfsId)).toBe(false);
			expect(getVirtualCollectionMetadata(vfsId)).toBeUndefined();
		}, 60000);
	});
});
