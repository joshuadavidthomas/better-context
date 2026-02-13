import type { FiletypeParserOptions } from '@opentui/core';

export const parsers = [
	{
		filetype: 'diff',
		wasm: 'https://github.com/tree-sitter-grammars/tree-sitter-diff/releases/download/v0.1.0/tree-sitter-diff.wasm',
		queries: {
			highlights: [
				'https://raw.githubusercontent.com/tree-sitter-grammars/tree-sitter-diff/v0.1.0/queries/highlights.scm'
			]
		}
	},
	{
		filetype: 'json',
		wasm: 'https://cdn.jsdelivr.net/npm/tree-sitter-json@0.24.8/tree-sitter-json.wasm',
		queries: {
			highlights: ['https://cdn.jsdelivr.net/npm/tree-sitter-json@0.24.8/queries/highlights.scm']
		}
	},
	{
		filetype: 'html',
		wasm: 'https://cdn.jsdelivr.net/npm/tree-sitter-html@0.23.2/tree-sitter-html.wasm',
		queries: {
			highlights: ['https://cdn.jsdelivr.net/npm/tree-sitter-html@0.23.2/queries/highlights.scm'],
			injections: ['https://cdn.jsdelivr.net/npm/tree-sitter-html@0.23.2/queries/injections.scm']
		}
	},
	{
		filetype: 'css',
		wasm: 'https://cdn.jsdelivr.net/npm/tree-sitter-css@0.25.0/tree-sitter-css.wasm',
		queries: {
			highlights: ['https://cdn.jsdelivr.net/npm/tree-sitter-css@0.25.0/queries/highlights.scm']
		}
	},
	{
		filetype: 'python',
		wasm: 'https://unpkg.com/tree-sitter-python@0.25.0/tree-sitter-python.wasm',
		queries: {
			highlights: ['https://unpkg.com/tree-sitter-python@0.25.0/queries/highlights.scm']
		}
	},
	{
		filetype: 'jsx',
		wasm: 'https://unpkg.com/tree-sitter-javascript@0.25.0/tree-sitter-javascript.wasm',
		queries: {
			highlights: [
				'https://unpkg.com/tree-sitter-javascript@0.25.0/queries/highlights.scm',
				'https://unpkg.com/tree-sitter-javascript@0.25.0/queries/highlights-jsx.scm',
				'https://unpkg.com/tree-sitter-javascript@0.25.0/queries/highlights-params.scm'
			]
		}
	},
	{
		filetype: 'tsx',
		wasm: 'https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-tsx.wasm',
		queries: {
			highlights: [
				'https://raw.githubusercontent.com/tree-sitter/tree-sitter-typescript/v0.23.2/queries/highlights.scm',
				'https://unpkg.com/tree-sitter-javascript@0.25.0/queries/highlights-jsx.scm'
			]
		}
	},
	{
		filetype: 'svelte',
		wasm: 'https://unpkg.com/tree-sitter-svelte@0.11.0/tree-sitter-svelte.wasm',
		queries: {
			highlights: ['https://unpkg.com/tree-sitter-svelte@0.11.0/queries/highlights.scm'],
			injections: ['https://unpkg.com/tree-sitter-svelte@0.11.0/queries/injections.scm']
		}
	},
	{
		filetype: 'sql',
		wasm: 'https://raw.githubusercontent.com/m-novikov/tree-sitter-sql/587f30d184b058450be2a2330878210c5f33b3f9/docs/tree-sitter-sql.wasm',
		queries: {
			highlights: [
				'https://raw.githubusercontent.com/m-novikov/tree-sitter-sql/587f30d184b058450be2a2330878210c5f33b3f9/queries/highlights.scm'
			]
		}
	},
	{
		filetype: 'rust',
		wasm: 'https://unpkg.com/tree-sitter-rust@0.24.0/tree-sitter-rust.wasm',
		queries: {
			highlights: ['https://unpkg.com/tree-sitter-rust@0.24.0/queries/highlights.scm']
		}
	},
	{
		filetype: 'go',
		wasm: 'https://unpkg.com/tree-sitter-go@0.25.0/tree-sitter-go.wasm',
		queries: {
			highlights: ['https://unpkg.com/tree-sitter-go@0.25.0/queries/highlights.scm']
		}
	},
	{
		filetype: 'yaml',
		wasm: 'https://unpkg.com/@tree-sitter-grammars/tree-sitter-yaml@0.7.1/tree-sitter-yaml.wasm',
		queries: {
			highlights: [
				'https://unpkg.com/@tree-sitter-grammars/tree-sitter-yaml@0.7.1/queries/highlights.scm'
			]
		}
	},
	{
		filetype: 'bash',
		wasm: 'https://unpkg.com/tree-sitter-bash@0.25.1/tree-sitter-bash.wasm',
		queries: {
			highlights: ['https://unpkg.com/tree-sitter-bash@0.25.1/queries/highlights.scm']
		}
	}
] as const satisfies FiletypeParserOptions[];
