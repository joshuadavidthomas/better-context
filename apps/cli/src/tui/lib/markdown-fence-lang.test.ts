import { describe, expect, test } from 'bun:test';

import { normalizeFenceLang } from './markdown-fence-lang.ts';

describe('normalizeFenceLang', () => {
	test('normalizes common aliases in fenced code blocks', () => {
		const input = [
			'# hi',
			'',
			'```ts',
			'const x = 1',
			'```',
			'',
			'```jsx',
			'<div />',
			'```',
			'',
			'```tsx',
			'<div />',
			'```',
			'',
			'```typescriptreact',
			'const x: string = "hi"',
			'```',
			'',
			'```svelte',
			'<button on:click>Go</button>',
			'```',
			'',
			'```  py',
			'print("hi")',
			'```',
			'',
			'~~~sh',
			'echo hi',
			'~~~',
			'',
			'```unknown',
			'x',
			'```'
		].join('\n');

		const output = normalizeFenceLang(input);

		expect(output).toContain('```typescript\n');
		expect(output).toContain('```jsx\n');
		expect(output).toContain('```tsx\n');
		expect(output).toContain('```  python\n');
		expect(output).toContain('```svelte\n');
		expect(output).toContain('~~~bash\n');
		expect(output).toContain('```unknown\n');
		expect(output).toContain('\n```\n');
	});

	test('preserves indentation and fence length', () => {
		const input = ['  ````tsx', '  <div />', '  ````'].join('\n');
		const output = normalizeFenceLang(input);
		expect(output).toBe(['  ````tsx', '  <div />', '  ````'].join('\n'));
	});
});
