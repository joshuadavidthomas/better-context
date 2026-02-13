import { useEffect, useMemo, useState } from 'react';
import type { TextareaRenderable } from '@opentui/core';
import { useKeyboard } from '@opentui/react';

import { useConfigContext } from '../context/config-context.tsx';
import { colors } from '../theme.ts';
import type { InputState } from '../types.ts';

interface RepoMentionPaletteProps {
	inputState: InputState;
	setInputState: (next: InputState | ((prev: InputState) => InputState)) => void;
	inputRef: TextareaRenderable | null;
	cursorPosition: number;
}

export const RepoMentionPalette = (props: RepoMentionPaletteProps) => {
	const config = useConfigContext();

	const [selectedIndex, setSelectedIndex] = useState(0);
	const maxVisible = 8;

	const getDisplayLength = (item: InputState[number]) =>
		item.type === 'pasted' ? `[~${item.lines} lines]`.length : item.content.length;

	const curInputIdx = () => {
		const currentInputIndex = props.cursorPosition;
		let curIdx = 0;
		let totalLength = 0;
		while (curIdx < props.inputState.length) {
			const curItem = props.inputState[curIdx]!;
			const maxIdx = totalLength + getDisplayLength(curItem);
			if (currentInputIndex >= totalLength && currentInputIndex <= maxIdx) {
				break;
			}
			totalLength = maxIdx;
			curIdx++;
		}
		return curIdx;
	};

	const filteredRepos = useMemo(() => {
		const repos = config.repos;
		const curInput = props.inputState[curInputIdx()]?.content;
		if (!curInput) return repos;
		const trimmedInput = curInput.toLowerCase().trim().slice(1);
		return repos.filter((repo) => repo.name.toLowerCase().includes(trimmedInput));
	}, [config.repos, props.inputState, props.cursorPosition]);

	useEffect(() => {
		setSelectedIndex((prev) => {
			if (filteredRepos.length === 0) return 0;
			if (prev >= filteredRepos.length) return filteredRepos.length - 1;
			return prev < 0 ? 0 : prev;
		});
	}, [filteredRepos.length]);

	const visibleRange = useMemo(() => {
		const start = Math.max(
			0,
			Math.min(selectedIndex - Math.floor(maxVisible / 2), filteredRepos.length - maxVisible)
		);
		return {
			start,
			repos: filteredRepos.slice(start, start + maxVisible)
		};
	}, [selectedIndex, filteredRepos]);

	const selectRepo = () => {
		const selectedRepo = filteredRepos[selectedIndex];
		if (!selectedRepo) return;

		const idx = curInputIdx();
		const currentState = props.inputState;
		const newContent = '@' + selectedRepo.name + ' ';
		const next: InputState = [
			...currentState.slice(0, idx),
			{ content: newContent, type: 'mention' as const },
			...currentState.slice(idx + 1)
		];
		props.setInputState(next);

		const inputRef = props.inputRef;
		if (!inputRef) return;

		let newCursorPos = 0;
		for (let i = 0; i <= idx; i++) {
			newCursorPos += i === idx ? newContent.length : getDisplayLength(currentState[i]!);
		}

		const newText = next
			.map((p) => (p.type === 'pasted' ? `[~${p.lines} lines]` : p.content))
			.join('');
		inputRef.setText(newText);
		inputRef.editBuffer.setCursor(0, newCursorPos);
	};

	useKeyboard((key) => {
		if (filteredRepos.length === 0) return;
		switch (key.name) {
			case 'up':
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredRepos.length - 1));
				break;
			case 'down':
				setSelectedIndex((prev) => (prev < filteredRepos.length - 1 ? prev + 1 : 0));
				break;
			case 'tab':
				selectRepo();
				break;
			case 'return':
				selectRepo();
				break;
			default:
				break;
		}
	});

	return (
		<box
			style={{
				position: 'absolute',
				bottom: 5,
				left: 1,
				width: 40,
				backgroundColor: colors.bgSubtle,
				border: true,
				borderColor: colors.accent,
				flexDirection: 'column',
				padding: 1
			}}
		>
			<text fg={colors.textMuted} content=" Select repo:" />
			{visibleRange.repos.map((repo, i) => {
				const actualIndex = visibleRange.start + i;
				const isSelected = actualIndex === selectedIndex;
				return (
					<text
						key={repo.name}
						fg={isSelected ? colors.accent : colors.text}
						content={isSelected ? `▸ @${repo.name}` : `  @${repo.name}`}
					/>
				);
			})}
		</box>
	);
};
