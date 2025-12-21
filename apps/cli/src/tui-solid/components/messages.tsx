import { For, Show, type Component } from 'solid-js';
import { useAppContext } from '../context/app-context';
import { colors } from '../theme';

const getColor = (type: 'text' | 'command' | 'mention') => {
	switch (type) {
		case 'mention':
			return colors.accent;
		case 'command':
			return '#FFD700';
		default:
			return colors.text;
	}
};

export const Messages: Component = () => {
	const appState = useAppContext();

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
								<text fg={colors.text} content={`${m.content}`} />
							</box>
						);
					}
				}}
			</For>

			{/* Loading/Streaming message */}
			<Show when={appState.mode() === 'loading'}>
				<box style={{ flexDirection: 'column', gap: 1 }}>
					<text fg={colors.success}>AI </text>
					<text fg={colors.text} content={appState.loadingText() || 'Thinking...'} />
				</box>
			</Show>
		</scrollbox>
	);
};
