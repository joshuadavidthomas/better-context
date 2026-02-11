import { describe, expect, test } from 'bun:test';

import { parsers } from './parsers-config.ts';

describe('parsers-config', () => {
	test('declares the expected parser filetypes', () => {
		const filetypes = parsers.map((p) => p.filetype).sort();
		expect(filetypes).toEqual([
			'bash',
			'css',
			'diff',
			'go',
			'html',
			'json',
			'jsx',
			'python',
			'rust',
			'sql',
			'svelte',
			'tsx',
			'yaml'
		]);
	});

	test('has remote wasm and highlights queries for each parser', () => {
		for (const p of parsers) {
			expect(p.wasm.startsWith('https://')).toBeTrue();
			expect(p.queries.highlights.length).toBeGreaterThan(0);
			expect(p.queries.highlights.every((u) => u.startsWith('https://'))).toBeTrue();
		}
	});
});
