import { useEffect, useMemo, useState } from 'react';

import { MarkdownText } from './markdown-text.tsx';
import { useMessagesContext } from '../context/messages-context.tsx';
import { colors, getColor } from '../theme.ts';
import type { AssistantContent, BtcaChunk } from '../types.ts';

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const LoadingSpinner = () => {
	const [frameIndex, setFrameIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % spinnerFrames.length);
		}, 80);
		return () => clearInterval(interval);
	}, []);

	return <text fg={colors.success}>{spinnerFrames[frameIndex]} </text>;
};

const summarizeTools = (chunks: BtcaChunk[]) => {
	const counts = new Map<string, number>();
	const order: string[] = [];

	for (const chunk of chunks) {
		if (chunk.type !== 'tool') continue;
		const name = chunk.toolName;
		if (!counts.has(name)) {
			counts.set(name, 0);
			order.push(name);
		}
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}

	return order.map((name) => ({ name, count: counts.get(name) ?? 0 }));
};

const ToolSummary = (props: { chunks: Extract<BtcaChunk, { type: 'tool' }>[] }) => {
	const items = summarizeTools(props.chunks);
	if (items.length === 0) return null;

	const summaryText = items.map((item) => `${item.name} ×${item.count}`).join(' | ');
	return (
		<box style={{ flexDirection: 'row', gap: 1 }}>
			<text fg={colors.textMuted}>Tools</text>
			<text fg={colors.textMuted}>{summaryText}</text>
		</box>
	);
};

const FileChunk = (props: { chunk: Extract<BtcaChunk, { type: 'file' }> }) => (
	<box style={{ flexDirection: 'row', gap: 1 }}>
		<text fg={colors.info}>📄</text>
		<text fg={colors.textMuted}>{props.chunk.filePath}</text>
	</box>
);

const ReasoningChunk = (props: {
	chunk: Extract<BtcaChunk, { type: 'reasoning' }>;
	isStreaming: boolean;
}) => (
	<box style={{ flexDirection: 'column', gap: 0 }}>
		<box style={{ flexDirection: 'row', gap: 1 }}>
			<text fg={colors.textSubtle}>💭 thinking</text>
			{props.isStreaming ? <LoadingSpinner /> : null}
		</box>
		<text fg={colors.textSubtle}>{props.chunk.text}</text>
	</box>
);

const TextChunk = (props: {
	chunk: Extract<BtcaChunk, { type: 'text' }>;
	isStreaming: boolean;
}) => {
	return <MarkdownText content={props.chunk.text} streaming={props.isStreaming} />;
};

const ChunkRenderer = (props: { chunk: BtcaChunk; isStreaming: boolean }) => {
	switch (props.chunk.type) {
		case 'tool':
			return <ToolSummary chunks={[props.chunk]} />;
		case 'file':
			return <FileChunk chunk={props.chunk} />;
		case 'reasoning':
			return <ReasoningChunk chunk={props.chunk} isStreaming={props.isStreaming} />;
		case 'text':
			return <TextChunk chunk={props.chunk} isStreaming={props.isStreaming} />;
		default:
			return null;
	}
};

type RenderItem =
	| { kind: 'chunk'; chunk: BtcaChunk }
	| { kind: 'tool-summary'; chunks: Extract<BtcaChunk, { type: 'tool' }>[] };

const ChunksRenderer = (props: {
	chunks: BtcaChunk[];
	isStreaming: boolean;
	isCanceled?: boolean;
	textColor?: string;
}) => {
	const items = useMemo(() => {
		const reasoning: BtcaChunk[] = [];
		const tools: Extract<BtcaChunk, { type: 'tool' }>[] = [];
		const text: BtcaChunk[] = [];
		const other: BtcaChunk[] = [];

		for (const chunk of props.chunks) {
			switch (chunk.type) {
				case 'reasoning':
					reasoning.push(chunk);
					break;
				case 'tool':
					tools.push(chunk);
					break;
				case 'text':
					text.push(chunk);
					break;
				default:
					other.push(chunk);
			}
		}

		const next: RenderItem[] = [];
		for (const chunk of reasoning) next.push({ kind: 'chunk', chunk });
		if (tools.length > 0) next.push({ kind: 'tool-summary', chunks: tools });
		for (const chunk of text) next.push({ kind: 'chunk', chunk });
		for (const chunk of other) next.push({ kind: 'chunk', chunk });
		return next;
	}, [props.chunks]);

	const lastChunkIndex = useMemo(() => {
		for (let i = items.length - 1; i >= 0; i -= 1) {
			if (items[i]?.kind === 'chunk') return i;
		}
		return -1;
	}, [items]);

	return (
		<box style={{ flexDirection: 'column', gap: 1 }}>
			{items.map((item, idx) => {
				if (item.kind === 'tool-summary') {
					const firstId = item.chunks[0]?.id ?? 'none';
					const lastId = item.chunks.at(-1)?.id ?? 'none';
					return (
						<ToolSummary
							key={`tool-summary:${firstId}:${lastId}:${item.chunks.length}`}
							chunks={item.chunks}
						/>
					);
				}

				const chunk = item.chunk;
				const isLastChunk = idx === lastChunkIndex;

				if (props.isCanceled && chunk.type === 'text') {
					return (
						<text key={`chunk:${chunk.id}`} fg={props.textColor}>
							{chunk.text}
						</text>
					);
				}

				return (
					<ChunkRenderer
						key={`chunk:${chunk.id}`}
						chunk={chunk}
						isStreaming={props.isStreaming && isLastChunk}
					/>
				);
			})}
		</box>
	);
};

const AssistantMessage = (props: {
	content: AssistantContent;
	isStreaming: boolean;
	isCanceled?: boolean;
}) => {
	const textColor = props.isCanceled ? colors.textMuted : undefined;

	if (typeof props.content === 'string') {
		if (props.isCanceled) {
			return <text fg={textColor}>{props.content}</text>;
		}
		return <MarkdownText content={props.content} streaming={props.isStreaming} />;
	}

	if (props.content.type === 'text') {
		if (props.isCanceled) {
			return <text fg={textColor}>{props.content.content}</text>;
		}
		return <MarkdownText content={props.content.content} streaming={props.isStreaming} />;
	}

	if (props.content.type === 'chunks') {
		return (
			<ChunksRenderer
				chunks={props.content.chunks}
				isStreaming={props.isStreaming}
				isCanceled={props.isCanceled}
				textColor={textColor}
			/>
		);
	}

	return null;
};

export const Messages = () => {
	const messagesState = useMessagesContext();

	const lastAssistantIndex = useMemo(() => {
		for (let i = messagesState.messages.length - 1; i >= 0; i--) {
			if (messagesState.messages[i]?.role === 'assistant') return i;
		}
		return -1;
	}, [messagesState.messages]);

	return (
		<box style={{ flexGrow: 1, position: 'relative' }}>
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
				{messagesState.messages.map((m, index) => {
					if (m.role === 'user') {
						return (
							<box key={`user:${index}`} style={{ flexDirection: 'column', gap: 1 }}>
								<text fg={colors.accent}>You </text>
								<text>
									{m.content.map((part, i) => (
										<span key={i} style={{ fg: getColor(part.type) }}>
											{part.content}
										</span>
									))}
								</text>
							</box>
						);
					}

					if (m.role === 'system') {
						return (
							<box key={`sys:${index}`} style={{ flexDirection: 'column', gap: 1 }}>
								<text fg={colors.info}>SYS </text>
								<text fg={colors.text} content={`${m.content}`} />
							</box>
						);
					}

					const isCanceled = m.canceled === true;
					const isStreaming = messagesState.isStreaming && index === lastAssistantIndex;

					return (
						<box key={`ai:${index}`} style={{ flexDirection: 'column', gap: 1 }}>
							<box style={{ flexDirection: 'row' }}>
								<text fg={isCanceled ? colors.textMuted : colors.success}>
									{isCanceled ? 'AI [canceled] ' : 'AI '}
								</text>
								{isStreaming ? <LoadingSpinner /> : null}
							</box>
							<AssistantMessage
								content={m.content}
								isStreaming={isStreaming}
								isCanceled={isCanceled}
							/>
						</box>
					);
				})}
			</scrollbox>
		</box>
	);
};
