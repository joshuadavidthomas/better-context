import { describe, expect, test } from 'bun:test';

import {
	extractMentionTokens,
	stripMentionTokens,
	stripResolvedMentionTokens
} from './resource-references.ts';

describe('resource references', () => {
	test('extracts mentions with surrounding punctuation', () => {
		const input = 'How does @svelte? compare to (@nextjs), and @tailwindcss.';

		expect(extractMentionTokens(input)).toEqual(['svelte', 'nextjs', 'tailwindcss']);
	});

	test('strips mentions while preserving surrounding punctuation', () => {
		const input = 'How does (@nextjs), compare to @svelte?';

		expect(stripMentionTokens(input)).toBe('How does (), compare to ?');
	});

	test('strips resolved mentions without dropping trailing punctuation', () => {
		const input = 'How does @svelte? compare to (@nextjs), exactly?';

		expect(stripResolvedMentionTokens(input, ['svelte', 'nextjs'])).toBe(
			'How does ? compare to (), exactly?'
		);
	});
});
