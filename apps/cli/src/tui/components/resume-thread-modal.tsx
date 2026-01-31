import { createSignal, For, Show, onMount, type Component } from 'solid-js';
import { useKeyboard } from '@opentui/solid';
import { colors } from '../theme.ts';
import { listThreads, type ThreadSummary } from '../thread-store.ts';

interface ResumeThreadModalProps {
	onSelect: (threadId: string) => void;
	onClose: () => void;
}

export const ResumeThreadModal: Component<ResumeThreadModalProps> = (props) => {
	const [threads, setThreads] = createSignal<ThreadSummary[]>([]);
	const [selectedIndex, setSelectedIndex] = createSignal(0);
	const [loadError, setLoadError] = createSignal<string | null>(null);

	onMount(async () => {
		try {
			const items = await listThreads();
			const sorted = [...items].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
			setThreads(sorted);
			setSelectedIndex(0);
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : 'Failed to load threads');
		}
	});

	const handleSelect = () => {
		const thread = threads()[selectedIndex()];
		if (!thread) return;
		props.onSelect(thread.id);
	};

	useKeyboard((key) => {
		switch (key.name) {
			case 'up':
				if (threads().length === 0) return;
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : threads().length - 1));
				break;
			case 'down':
				if (threads().length === 0) return;
				setSelectedIndex((prev) => (prev < threads().length - 1 ? prev + 1 : 0));
				break;
			case 'return':
				handleSelect();
				break;
			case 'escape':
				props.onClose();
				break;
			default:
				break;
		}
	});

	return (
		<box
			style={{
				position: 'absolute',
				bottom: 6,
				left: 0,
				width: '100%',
				zIndex: 120,
				backgroundColor: colors.bgSubtle,
				border: true,
				borderColor: colors.accent,
				flexDirection: 'column',
				padding: 1
			}}
		>
			<text fg={colors.textMuted} content=" Resume thread" />
			<text content="" style={{ height: 1 }} />
			<Show
				when={!loadError() && threads().length > 0}
				fallback={<text fg={colors.textSubtle} content={loadError() ?? 'No threads yet'} />}
			>
				<For each={threads()}>
					{(thread, i) => {
						const isSelected = () => i() === selectedIndex();
						const label = thread.title?.trim() ? thread.title.trim() : 'Untitled thread';
						const lastActive = new Date(thread.lastActivityAt).toLocaleString();
						return (
							<box style={{ flexDirection: 'row' }}>
								<text
									fg={isSelected() ? colors.accent : colors.text}
									content={isSelected() ? `▸ ${label}` : `  ${label}`}
									style={{ width: '60%' }}
								/>
								<text fg={colors.textSubtle} content={` ${lastActive}`} />
							</box>
						);
					}}
				</For>
			</Show>
		</box>
	);
};
