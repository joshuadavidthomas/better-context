import { describe, expect, test } from 'bun:test';

import {
	extractMentionTokens,
	isAnonymousResourceReference,
	resolveMentionResourceReference,
	stripMentionTokens
} from './resource-mentions.ts';

describe('resource mentions', () => {
	test('extracts configured and anonymous mention tokens', () => {
		const input = [
			'@svelte how should I format this with',
			'@npm:prettier and',
			'@https://github.com/sveltejs/svelte.dev ?'
		].join(' ');

		expect(extractMentionTokens(input)).toEqual([
			'svelte',
			'npm:prettier',
			'https://github.com/sveltejs/svelte.dev'
		]);
	});

	test('strips mention tokens and keeps question text', () => {
		const input = '@svelte @npm:prettier how do I format this?';
		expect(stripMentionTokens(input)).toBe('how do I format this?');
	});

	test('resolves configured resources case-insensitively', () => {
		const available = [{ name: 'SvelteDocs' }, { name: 'my-local-docs' }];
		expect(resolveMentionResourceReference('sveltedocs', available)).toBe('SvelteDocs');
		expect(resolveMentionResourceReference('@my-local-docs', available)).toBe('my-local-docs');
	});

	test('resolves anonymous npm and git references', () => {
		const available = [{ name: 'svelte' }];
		expect(resolveMentionResourceReference('npm:@types/node@22.10.1', available)).toBe(
			'npm:@types/node@22.10.1'
		);
		expect(
			resolveMentionResourceReference('https://github.com/sveltejs/svelte.dev', available)
		).toBe('https://github.com/sveltejs/svelte.dev');
	});

	test('rejects unknown non-anonymous resources', () => {
		expect(resolveMentionResourceReference('unknown-resource', [{ name: 'svelte' }])).toBeNull();
	});

	test('identifies anonymous references', () => {
		expect(isAnonymousResourceReference('npm:prettier')).toBe(true);
		expect(isAnonymousResourceReference('https://github.com/sveltejs/svelte.dev')).toBe(true);
		expect(isAnonymousResourceReference('svelte')).toBe(false);
	});
});
