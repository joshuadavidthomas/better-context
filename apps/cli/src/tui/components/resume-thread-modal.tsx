import { useEffect, useMemo, useState } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';

import { colors } from '../theme.ts';
import { listThreads, type ThreadSummary } from '../thread-store.ts';

interface ResumeThreadModalProps {
	onSelect: (threadId: string) => void;
	onClose: () => void;
	maxVisibleItems: number;
}

export const ResumeThreadModal = (props: ResumeThreadModalProps) => {
	const [threads, setThreads] = useState<ThreadSummary[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [loadError, setLoadError] = useState<string | null>(null);
	const maxVisibleItems = Math.max(1, props.maxVisibleItems);
	const terminalDimensions = useTerminalDimensions();

	const visibleRange = useMemo(() => {
		const start = Math.max(
			0,
			Math.min(
				selectedIndex - Math.floor(maxVisibleItems / 2),
				Math.max(threads.length - maxVisibleItems, 0)
			)
		);
		return {
			start,
			threads: threads.slice(start, start + maxVisibleItems)
		};
	}, [maxVisibleItems, selectedIndex, threads]);

	const truncate = (value: string, maxLength: number) => {
		if (value.length <= maxLength) return value;
		if (maxLength <= 1) return '…';
		return `${value.slice(0, maxLength - 1)}…`;
	};

	// Terminal UIs often need explicit padding to overwrite prior longer lines.
	// Some renderers trim trailing ASCII spaces, so we pad with NBSPs to force full-width overwrites.
	const fit = (value: string, width: number) => truncate(value, width).padEnd(width, '\u00A0');

	const contentWidth = Math.max(1, terminalDimensions.width - 4); // border + padding (approx)
	const titleWidth = Math.max(10, Math.floor(contentWidth * 0.6));
	const dateWidth = Math.max(10, contentWidth - titleWidth);

	useEffect(() => {
		let canceled = false;
		void (async () => {
			try {
				const items = await listThreads();
				const sorted = [...items].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
				if (canceled) return;
				setThreads(sorted);
				setSelectedIndex(0);
			} catch (error) {
				if (canceled) return;
				setLoadError(error instanceof Error ? error.message : 'Failed to load threads');
			}
		})();
		return () => {
			canceled = true;
		};
	}, []);

	const handleSelect = () => {
		const thread = threads[selectedIndex];
		if (!thread) return;
		props.onSelect(thread.id);
	};

	useKeyboard((key) => {
		switch (key.name) {
			case 'up':
				if (threads.length === 0) return;
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : threads.length - 1));
				break;
			case 'down':
				if (threads.length === 0) return;
				setSelectedIndex((prev) => (prev < threads.length - 1 ? prev + 1 : 0));
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
				height: maxVisibleItems + 3,
				flexDirection: 'column',
				padding: 1
			}}
		>
			<text fg={colors.textMuted} content=" Resume thread" />
			<text content="" style={{ height: 1 }} />
			{!loadError && threads.length > 0 ? (
				visibleRange.threads.map((thread, i) => {
					const actualIndex = visibleRange.start + i;
					const isSelected = actualIndex === selectedIndex;
					const label = thread.title?.trim() ? thread.title.trim() : 'Untitled thread';
					const lastActive = new Date(thread.lastActivityAt).toLocaleString();
					const prefix = isSelected ? '▸ ' : '  ';
					return (
						<box key={thread.id} style={{ flexDirection: 'row' }}>
							<text
								fg={isSelected ? colors.accent : colors.text}
								content={fit(prefix + label, titleWidth)}
								style={{ width: titleWidth }}
							/>
							<text
								fg={colors.textSubtle}
								content={fit(` ${lastActive}`, dateWidth)}
								style={{ width: dateWidth }}
							/>
						</box>
					);
				})
			) : (
				<text fg={colors.textSubtle} content={loadError ?? 'No threads yet'} />
			)}
		</box>
	);
};
