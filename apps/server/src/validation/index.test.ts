import { describe, expect, it } from 'bun:test';

import { validateResourceReference, validateResourcesArray } from './index.ts';

describe('validateResourceReference', () => {
	it('accepts configured resource names', () => {
		const result = validateResourceReference('svelte');
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.value).toBe('svelte');
		}
	});

	it('accepts and normalizes https Git URLs', () => {
		const result = validateResourceReference(
			'https://github.com/sveltejs/svelte.dev/tree/main/packages'
		);
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.value).toBe('https://github.com/sveltejs/svelte.dev');
		}
	});

	it('rejects invalid resource references', () => {
		const result = validateResourceReference('not a resource');
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('Invalid resource reference');
		}
	});

	it('rejects non-https URLs', () => {
		const result = validateResourceReference('http://github.com/sveltejs/svelte');
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('Invalid resource reference');
		}
	});
});

describe('validateResourcesArray', () => {
	it('validates names and URLs together', () => {
		const result = validateResourcesArray(['svelte', 'https://github.com/sveltejs/svelte.dev']);
		expect(result.valid).toBe(true);
	});
});
