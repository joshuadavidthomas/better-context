import { RGBA, SyntaxStyle } from '@opentui/core';

import { colors } from './theme.ts';

/**
 * Dark-plus-inspired syntax theme for tree-sitter highlight groups.
 * Maps tree-sitter capture names to colors matching VS Code's dark+ theme.
 */
export const syntaxStyle = SyntaxStyle.fromStyles({
	default: { fg: RGBA.fromHex(colors.text), bg: RGBA.fromHex(colors.bg) },
	conceal: { fg: RGBA.fromHex(colors.textSubtle), bg: RGBA.fromHex(colors.bg) },

	// Keywords & control flow
	keyword: { fg: RGBA.fromHex('#569cd6'), bold: true },
	'keyword.operator': { fg: RGBA.fromHex('#569cd6') },
	'keyword.function': { fg: RGBA.fromHex('#569cd6'), bold: true },
	'keyword.return': { fg: RGBA.fromHex('#569cd6'), bold: true },
	'keyword.import': { fg: RGBA.fromHex('#569cd6'), bold: true },
	'keyword.conditional': { fg: RGBA.fromHex('#c586c0') },
	'keyword.repeat': { fg: RGBA.fromHex('#c586c0') },
	'keyword.exception': { fg: RGBA.fromHex('#c586c0') },
	'keyword.directive': { fg: RGBA.fromHex('#c586c0') },

	// Types
	type: { fg: RGBA.fromHex('#4ec9b0') },
	'type.builtin': { fg: RGBA.fromHex('#4ec9b0') },
	'type.definition': { fg: RGBA.fromHex('#4ec9b0') },

	// Functions
	function: { fg: RGBA.fromHex('#dcdcaa') },
	'function.call': { fg: RGBA.fromHex('#dcdcaa') },
	'function.builtin': { fg: RGBA.fromHex('#dcdcaa') },
	'function.method': { fg: RGBA.fromHex('#dcdcaa') },
	method: { fg: RGBA.fromHex('#dcdcaa') },

	// Variables & properties
	variable: { fg: RGBA.fromHex('#9cdcfe') },
	'variable.builtin': { fg: RGBA.fromHex('#569cd6') },
	'variable.parameter': { fg: RGBA.fromHex('#9cdcfe') },
	property: { fg: RGBA.fromHex('#9cdcfe') },

	// Strings
	string: { fg: RGBA.fromHex('#ce9178') },
	'string.special': { fg: RGBA.fromHex('#d7ba7d') },
	'string.escape': { fg: RGBA.fromHex('#d7ba7d') },

	// Numbers & constants
	number: { fg: RGBA.fromHex('#b5cea8') },
	float: { fg: RGBA.fromHex('#b5cea8') },
	boolean: { fg: RGBA.fromHex('#569cd6') },
	constant: { fg: RGBA.fromHex('#4fc1ff') },
	'constant.builtin': { fg: RGBA.fromHex('#569cd6') },

	// Comments
	comment: { fg: RGBA.fromHex('#6a9955'), italic: true },

	// Operators & punctuation
	operator: { fg: RGBA.fromHex('#d4d4d4') },
	punctuation: { fg: RGBA.fromHex('#d4d4d4') },
	'punctuation.bracket': { fg: RGBA.fromHex('#d4d4d4') },
	'punctuation.delimiter': { fg: RGBA.fromHex('#d4d4d4') },
	'punctuation.special': { fg: RGBA.fromHex('#569cd6') },

	// Tags (HTML/JSX)
	tag: { fg: RGBA.fromHex('#569cd6') },
	'tag.attribute': { fg: RGBA.fromHex('#9cdcfe') },

	// Namespace & module
	namespace: { fg: RGBA.fromHex('#4ec9b0') },
	module: { fg: RGBA.fromHex('#4ec9b0') },

	// Labels & special
	label: { fg: RGBA.fromHex('#c586c0') },
	attribute: { fg: RGBA.fromHex('#9cdcfe') },
	constructor: { fg: RGBA.fromHex('#4ec9b0') },

	// Diff
	'text.diff.add': { fg: RGBA.fromHex('#22c55e') },
	'text.diff.delete': { fg: RGBA.fromHex('#ef4444') },

	// Embedded / injection
	embedded: { fg: RGBA.fromHex('#d4d4d4') },

	// Markdown presentation groups used by OpenTUI's markdown renderer
	'markup.heading': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.heading.1': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.heading.2': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.heading.3': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.heading.4': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.heading.5': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.heading.6': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.list': { fg: RGBA.fromHex(colors.accent) },
	'markup.list.checked': { fg: RGBA.fromHex(colors.success) },
	'markup.list.unchecked': { fg: RGBA.fromHex(colors.textMuted) },
	'markup.quote': { fg: RGBA.fromHex(colors.textMuted), italic: true },
	'markup.link': { fg: RGBA.fromHex(colors.info), underline: true },
	'markup.link.url': { fg: RGBA.fromHex(colors.info), underline: true },
	'markup.link.label': { fg: RGBA.fromHex(colors.info), underline: true },
	'markup.raw': { fg: RGBA.fromHex(colors.success) },
	'markup.raw.block': { fg: RGBA.fromHex(colors.success) }
});
