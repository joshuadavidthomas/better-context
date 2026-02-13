import { describe, expect, it } from 'bun:test';

import { Resources, createAnonymousDirectoryKey } from './service.ts';
import { resourceNameToKey } from './helpers.ts';
import { type ResourceDefinition } from './schema.ts';

describe('Resources.resolveResourceDefinition', () => {
	const configuredResource: ResourceDefinition = {
		type: 'git',
		name: 'svelte',
		url: 'https://github.com/sveltejs/svelte.dev',
		branch: 'main',
		searchPath: 'apps/svelte.dev'
	};

	const getResource = (name: string) => (name === 'svelte' ? configuredResource : undefined);

	it('resolves configured resources by name first', () => {
		const definition = Resources.resolveResourceDefinition('svelte', getResource);
		expect(definition.type).toBe('git');
		expect(definition.name).toBe('svelte');
	});

	it('creates anonymous git resources from valid URLs', () => {
		const definition = Resources.resolveResourceDefinition(
			'https://github.com/sveltejs/svelte.dev/tree/main/packages',
			() => undefined
		);
		expect(definition.type).toBe('git');
		if (definition.type === 'git') {
			expect(definition.url).toBe('https://github.com/sveltejs/svelte.dev');
			expect(definition.branch).toBe('main');
			expect(definition.name.startsWith('anonymous:')).toBe(true);
		}
	});

	it('creates anonymous npm resources from npm references', () => {
		const definition = Resources.resolveResourceDefinition(
			'npm:@types/node@22.10.1',
			() => undefined
		);
		expect(definition.type).toBe('npm');
		if (definition.type === 'npm') {
			expect(definition.package).toBe('@types/node');
			expect(definition.version).toBe('22.10.1');
			expect(definition.name).toBe('anonymous:npm:@types/node@22.10.1');
		}
	});

	it('creates anonymous npm resources from npm package URLs', () => {
		const definition = Resources.resolveResourceDefinition(
			'https://www.npmjs.com/package/react/v/19.0.0',
			() => undefined
		);
		expect(definition.type).toBe('npm');
		if (definition.type === 'npm') {
			expect(definition.package).toBe('react');
			expect(definition.version).toBe('19.0.0');
		}
	});

	it('reuses the same cache key for repeated normalized URLs', () => {
		const first = Resources.createAnonymousResource('https://github.com/sveltejs/svelte.dev');
		const second = Resources.createAnonymousResource(
			'https://github.com/sveltejs/svelte.dev/blob/main/packages'
		);
		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		if (first && second) {
			expect(resourceNameToKey(first.name)).toBe(resourceNameToKey(second.name));
		}
	});

	it('uses short deterministic keys for anonymous repository paths', () => {
		const main = Resources.createAnonymousResource('https://github.com/sveltejs/svelte.dev');
		const withPath = Resources.createAnonymousResource(
			'https://github.com/sveltejs/svelte.dev/tree/main/packages'
		);
		expect(main).not.toBeNull();
		expect(withPath).not.toBeNull();
		if (main && withPath && main.type === 'git' && withPath.type === 'git') {
			expect(createAnonymousDirectoryKey(main.url)).toBe(createAnonymousDirectoryKey(withPath.url));
		}
		if (main) {
			expect(main.name.startsWith('anonymous:')).toBe(true);
			expect(main.name.length).toBeGreaterThan(19);
		}
	});
});
