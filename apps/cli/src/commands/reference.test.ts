import { describe, expect, test } from 'bun:test';
import { extractRepoName, isPatternIgnored } from './reference.ts';

describe('extractRepoName', () => {
	test('parses https github url with .git suffix', () => {
		expect(extractRepoName('https://github.com/org/repo.git')).toBe('repo');
	});

	test('parses https github url without .git suffix', () => {
		expect(extractRepoName('https://github.com/org/repo')).toBe('repo');
	});

	test('parses scp-style git url', () => {
		expect(extractRepoName('git@github.com:org/repo.git')).toBe('repo');
	});

	test('parses local path', () => {
		expect(extractRepoName('../local/repo')).toBe('repo');
	});

	test('throws on invalid input', () => {
		expect(() => extractRepoName('')).toThrow('Repository argument is required.');
	});
});

describe('isPatternIgnored', () => {
	test('returns true when references rule exists', () => {
		expect(isPatternIgnored('dist/\nreferences/\n', 'references/')).toBe(true);
	});

	test('returns true for wildcard variant', () => {
		expect(isPatternIgnored('references/*\n', 'references/')).toBe(true);
	});

	test('returns false when only comment includes pattern', () => {
		expect(isPatternIgnored('# references/\n', 'references/')).toBe(false);
	});
});
