import { describe, expect, test } from 'bun:test';
import { firstOperand, normalizeCliArgv } from './argv.ts';

describe('cli argv compatibility', () => {
	test('preserves version shorthand', () => {
		expect(normalizeCliArgv(['-v'])).toEqual(['--version']);
	});

	test('keeps root launch flags when no subcommand is present', () => {
		expect(normalizeCliArgv(['--no-tui', '--server', 'http://localhost:8080'])).toEqual([
			'--no-tui',
			'--server',
			'http://localhost:8080'
		]);
	});

	test('moves root server flags behind supported subcommands', () => {
		expect(normalizeCliArgv(['--server', 'http://localhost:9999', 'ask', '-q', 'hi'])).toEqual([
			'ask',
			'--server',
			'http://localhost:9999',
			'-q',
			'hi'
		]);
	});

	test('moves ask compatibility flags behind ask subcommand', () => {
		expect(normalizeCliArgv(['--no-thinking', '--no-tools', 'ask', '-q', 'hi'])).toEqual([
			'ask',
			'--no-thinking',
			'--no-tools',
			'-q',
			'hi'
		]);
	});

	test('drops root runtime flags that are irrelevant once a subcommand is present', () => {
		expect(normalizeCliArgv(['--no-tui', 'add', '--help'])).toEqual(['add', '--help']);
	});

	test('does not treat root flag values as operands', () => {
		expect(firstOperand(['--server', 'http://localhost:9999', 'ask'])).toBe('ask');
	});
});
