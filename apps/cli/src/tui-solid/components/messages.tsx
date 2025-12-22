import { For, Show, type Component } from 'solid-js';
import { useAppContext } from '../context/app-context';
import { colors, getColor } from '../theme';
import { RGBA, SyntaxStyle } from '@opentui/core';

export const Messages: Component = () => {
	const appState = useAppContext();

	const syntaxStyle = SyntaxStyle.fromStyles({
		// Headings
		'markup.heading.1': { fg: RGBA.fromHex(colors.accent), bold: true },
		'markup.heading.2': { fg: RGBA.fromHex(colors.accent), bold: true },
		'markup.heading.3': { fg: RGBA.fromHex(colors.accent), bold: true },
		'markup.heading.4': { fg: RGBA.fromHex(colors.accent), bold: true },
		'markup.heading.5': { fg: RGBA.fromHex(colors.accent), bold: true },
		'markup.heading.6': { fg: RGBA.fromHex(colors.accent), bold: true },
		'markup.heading': { fg: RGBA.fromHex(colors.accent), bold: true },

		// Text formatting
		'markup.bold': { fg: RGBA.fromHex(colors.text), bold: true },
		'markup.italic': { fg: RGBA.fromHex(colors.text), italic: true },
		'markup.strikethrough': { fg: RGBA.fromHex(colors.textMuted) },

		// Code
		'markup.raw': { fg: RGBA.fromHex(colors.success) },
		'markup.raw.inline': { fg: RGBA.fromHex(colors.success) },
		'markup.raw.block': { fg: RGBA.fromHex(colors.success) },
		fenced_code_block: { fg: RGBA.fromHex(colors.success) },
		code_fence_content: { fg: RGBA.fromHex(colors.text) },

		// Links
		'markup.link': { fg: RGBA.fromHex(colors.info), underline: true },
		'markup.link.url': { fg: RGBA.fromHex(colors.info), underline: true },
		'markup.link.text': { fg: RGBA.fromHex(colors.info) },
		'string.other.link': { fg: RGBA.fromHex(colors.info), underline: true },

		// Lists
		'markup.list': { fg: RGBA.fromHex(colors.text) },
		'markup.list.unnumbered': { fg: RGBA.fromHex(colors.text) },
		'markup.list.numbered': { fg: RGBA.fromHex(colors.text) },
		'punctuation.definition.list': { fg: RGBA.fromHex(colors.accent) },

		// Quotes
		'markup.quote': { fg: RGBA.fromHex(colors.textMuted), italic: true },

		// Punctuation (markdown symbols like #, *, etc.)
		'punctuation.definition.heading': { fg: RGBA.fromHex(colors.textSubtle) },
		'punctuation.definition.bold': { fg: RGBA.fromHex(colors.textSubtle) },
		'punctuation.definition.italic': { fg: RGBA.fromHex(colors.textSubtle) },

		// Default
		default: { fg: RGBA.fromHex(colors.text) }
	});

	return (
		<scrollbox
			style={{
				flexGrow: 1,
				rootOptions: {
					border: true,
					borderColor: colors.border
				},
				contentOptions: {
					flexDirection: 'column',
					padding: 1,
					gap: 2
				},
				stickyScroll: true,
				stickyStart: 'bottom'
			}}
		>
			<For each={appState.messageHistory()}>
				{(m) => {
					if (m.role === 'user') {
						return (
							<box style={{ flexDirection: 'column', gap: 1 }}>
								<text fg={colors.accent}>You </text>
								<text>
									<For each={m.content}>
										{(part) => <span style={{ fg: getColor(part.type) }}>{part.content}</span>}
									</For>
								</text>
							</box>
						);
					}
					if (m.role === 'system') {
						return (
							<box style={{ flexDirection: 'column', gap: 1 }}>
								<text fg={colors.info}>SYS </text>
								<text fg={colors.text} content={`${m.content}`} />
							</box>
						);
					}
					if (m.role === 'assistant') {
						return (
							<box style={{ flexDirection: 'column', gap: 1 }}>
								<text fg={colors.success}>AI </text>
								{/* <text fg={colors.text} content={`${m.content}`} /> */}
								<code filetype="markdown" content={m.content} syntaxStyle={syntaxStyle} />
							</box>
						);
					}
				}}
			</For>

			{/* Loading/Streaming message */}
			<Show when={appState.mode() === 'loading'}>
				<box style={{ flexDirection: 'column', gap: 1 }}>
					<text fg={colors.success}>AI </text>
					<text fg={colors.text} content={appState.loadingText() || 'Cloning repo...'} />
				</box>
			</Show>
		</scrollbox>
	);
};
