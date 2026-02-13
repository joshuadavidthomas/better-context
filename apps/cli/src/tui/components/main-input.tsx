import { useEffect, useRef, useState } from 'react';
import type { KeyEvent, TextareaRenderable } from '@opentui/core';
import { useRenderer, useTerminalDimensions } from '@opentui/react';

import { usePaste } from '../opentui-hooks.ts';
import { colors, getColor } from '../theme.ts';
import type { CancelState, InputState } from '../types.ts';
import { registerMainInputFocusHandler } from '../focus-registry.ts';

interface MainInputProps {
	inputState: InputState;
	setInputState: (next: InputState | ((prev: InputState) => InputState)) => void;
	cursorPosition: number;
	setCursorPosition: (next: number | ((prev: number) => number)) => void;
	inputRef: TextareaRenderable | null;
	setInputRef: (ref: TextareaRenderable | null) => void;
	focused: boolean;
	isStreaming: boolean;
	cancelState: CancelState;
}

export const MainInput = (props: MainInputProps) => {
	const renderer = useRenderer();
	const terminalDimensions = useTerminalDimensions();
	const textareaRef = useRef<TextareaRenderable | null>(null);

	const [displayValue, setDisplayValue] = useState('');

	const getPasteDisplay = (lines: number) => `[~${lines} lines]`;

	const getValue = () =>
		props.inputState
			.map((p) => (p.type === 'pasted' ? getPasteDisplay(p.lines) : p.content))
			.join('');

	const isEmpty = () => getValue().length === 0;

	const focusInput = () => {
		const ref = textareaRef.current;
		if (!ref || !props.focused) return;
		ref.focus();
	};

	const syncCursorFromRef = () => {
		const ref = textareaRef.current;
		if (!ref) return;
		const cursor = ref.logicalCursor;
		props.setCursorPosition(cursor.row * getAvailableWidth() + cursor.col);
	};

	const getPlaceholder = () => {
		if (props.isStreaming && props.cancelState === 'pending') {
			return 'confirm with esc to cancel';
		}
		if (props.isStreaming) {
			return 'press esc to cancel';
		}
		return '@repo question... or / for commands';
	};

	const getPartValueLength = (p: InputState[number]) =>
		p.type === 'pasted' ? getPasteDisplay(p.lines).length : p.content.length;

	const getAvailableWidth = () => {
		const width = terminalDimensions.width;
		return Math.max(1, width - 4);
	};

	const getLineCount = () => {
		const value = getValue();
		const availableWidth = getAvailableWidth();
		if (value.length === 0) return 1;
		return Math.max(1, Math.ceil(value.length / availableWidth));
	};

	const getBoxHeight = () => getLineCount() + 2;

	useEffect(() => {
		const value = getValue();
		setDisplayValue(value);
		const ref = textareaRef.current;
		if (ref && ref.plainText !== value) {
			ref.setText(value);
		}
	}, [props.inputState]);

	useEffect(() => {
		if (props.focused) {
			focusInput();
			syncCursorFromRef();
		} else {
			textareaRef.current?.blur();
		}
	}, [props.focused]);

	useEffect(() => {
		const handleFocus = () => {
			focusInput();
			syncCursorFromRef();
		};

		renderer.on('focus', handleFocus);

		return () => {
			renderer.off('focus', handleFocus);
		};
	}, [props.focused, renderer]);

	useEffect(() => {
		const focusFromGlobalClick = () => {
			const ref = textareaRef.current;
			if (!ref) return;
			ref.focus();
		};

		registerMainInputFocusHandler(focusFromGlobalClick);
		return () => {
			registerMainInputFocusHandler(null);
		};
	}, []);

	usePaste((event) => {
		if (!props.focused) return;
		const lines = event.text.split('\n').length;
		const next = [...props.inputState, { type: 'pasted' as const, content: event.text, lines }];
		props.setInputState(next);

		queueMicrotask(() => {
			const ref = textareaRef.current;
			if (!ref) return;
			const newValue = next
				.map((p) => (p.type === 'pasted' ? getPasteDisplay(p.lines) : p.content))
				.join('');
			ref.setText(newValue);
			ref.gotoBufferEnd();
			const cursor = ref.logicalCursor;
			props.setCursorPosition(cursor.row * getAvailableWidth() + cursor.col);
		});
	});

	function parseTextSegment(
		value: string
	): { type: 'text' | 'command' | 'mention'; content: string }[] {
		if (!value) return [];
		const parts: { type: 'text' | 'command' | 'mention'; content: string }[] = [];

		if (value.startsWith('/')) {
			const spaceIndex = value.indexOf(' ');
			if (spaceIndex === -1) {
				parts.push({ type: 'command', content: value });
			} else {
				parts.push({ type: 'command', content: value.slice(0, spaceIndex) });
				parts.push({ type: 'text', content: value.slice(spaceIndex) });
			}
			return parts;
		}

		const regex = /(^|(?<=\s))@[A-Za-z0-9@._/-]*/g;
		let lastIndex = 0;
		let match;
		while ((match = regex.exec(value)) !== null) {
			if (match.index > lastIndex) {
				parts.push({ type: 'text', content: value.slice(lastIndex, match.index) });
			}
			parts.push({ type: 'mention', content: match[0] });
			lastIndex = regex.lastIndex;
		}

		if (lastIndex < value.length) {
			parts.push({ type: 'text', content: value.slice(lastIndex) });
		}
		return parts;
	}

	function handleContentChange(newValue: string) {
		setDisplayValue(newValue);
		const pastedBlocks = props.inputState.filter((p) => p.type === 'pasted');

		if (pastedBlocks.length === 0) {
			props.setInputState(parseTextSegment(newValue));
			return;
		}

		const result: InputState = [];
		let remaining = newValue;

		for (const block of pastedBlocks) {
			const display = getPasteDisplay(block.lines);
			const idx = remaining.indexOf(display);

			if (idx === -1) continue;

			const before = remaining.slice(0, idx);
			if (before) result.push(...parseTextSegment(before));
			result.push(block);
			remaining = remaining.slice(idx + display.length);
		}

		if (remaining) {
			result.push(...parseTextSegment(remaining));
		}

		props.setInputState(result);
	}

	function handleKeyDown(event: KeyEvent) {
		if (event.name === 'return' || event.name === 'linefeed') {
			event.preventDefault();
			return;
		}

		if (event.name === 'backspace') {
			const ref = textareaRef.current;
			if (!ref) return;
			const cursor = ref.logicalCursor;
			const plainText = ref.plainText;

			let absolutePos = 0;
			const lines = plainText.split('\n');
			for (let i = 0; i < cursor.row; i++) {
				absolutePos += (lines[i]?.length ?? 0) + 1;
			}
			absolutePos += cursor.col;

			let offset = 0;
			for (let i = 0; i < props.inputState.length; i++) {
				const part = props.inputState[i]!;
				const valueLen = getPartValueLength(part);

				if (absolutePos <= offset + valueLen) {
					if (part.type === 'pasted') {
						event.preventDefault();
						const next = [...props.inputState.slice(0, i), ...props.inputState.slice(i + 1)];
						props.setInputState(next);

						const newValue = next
							.map((p) => (p.type === 'pasted' ? getPasteDisplay(p.lines) : p.content))
							.join('');
						ref.setText(newValue);

						ref.editBuffer.setCursor(0, offset);
						props.setCursorPosition(offset);
						return;
					}
					break;
				}
				offset += valueLen;
			}
		}

		queueMicrotask(() => {
			const ref = textareaRef.current;
			if (!ref) return;
			const cursor = ref.logicalCursor;
			props.setCursorPosition(cursor.row * getAvailableWidth() + cursor.col);
		});
	}

	return (
		<box
			style={{
				border: true,
				borderColor: colors.accent,
				height: getBoxHeight(),
				width: '100%'
			}}
		>
			<text
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: '100%',
					height: getLineCount(),
					zIndex: 2,
					paddingLeft: 1,
					paddingRight: 1
				}}
				wrapMode="char"
				onMouseDown={(e) => {
					const ref = textareaRef.current;
					if (!ref) return;
					ref.focus();
					const availableWidth = getAvailableWidth();
					const row = e.y;
					const col = e.x - 1;
					const pos = row * availableWidth + col;
					const clampedPos = Math.min(pos, getValue().length);
					ref.editBuffer.setCursor(0, clampedPos);
					queueMicrotask(() => {
						props.setCursorPosition(clampedPos);
					});
				}}
			>
				{isEmpty() ? (
					<span style={{ fg: colors.textSubtle }}>{getPlaceholder()}</span>
				) : (
					props.inputState.map((part, i) =>
						part.type === 'pasted' ? (
							<span key={i} style={{ fg: colors.bg, bg: colors.accent }}>
								{`[~${part.lines} lines]`}
							</span>
						) : (
							<span key={i} style={{ fg: getColor(part.type) }}>
								{part.content}
							</span>
						)
					)
				)}
			</text>

			<textarea
				id="main-input"
				ref={(r: TextareaRenderable) => {
					textareaRef.current = r;
					props.setInputRef(r);
				}}
				initialValue=""
				wrapMode="char"
				focused={props.focused}
				onContentChange={() => {
					const ref = textareaRef.current;
					if (ref) {
						handleContentChange(ref.plainText);
					}
				}}
				onKeyDown={handleKeyDown}
				onCursorChange={() => {
					syncCursorFromRef();
				}}
				textColor="transparent"
				backgroundColor="transparent"
				focusedBackgroundColor="transparent"
				cursorColor={colors.accent}
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: '100%',
					minHeight: 1,
					zIndex: 1,
					paddingLeft: 1,
					paddingRight: 1
				}}
			/>
		</box>
	);
};
