import { useMemo, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { Result } from 'better-result';

import { useConfigContext } from '../context/config-context.tsx';
import { useMessagesContext } from '../context/messages-context.tsx';
import { formatError } from '../lib/format-error.ts';
import { services } from '../services.ts';
import { colors } from '../theme.ts';

const BLESSED_MODELS = [
	{
		provider: 'opencode',
		model: 'claude-haiku-4-5',
		description: 'Claude Haiku 4.5, no reasoning. I HIGHLY recommend this model.'
	},
	{
		provider: 'opencode',
		model: 'minimax-m2.1-free',
		description: 'Minimax M2.1: very fast, very cheap, pretty good'
	},
	{
		provider: 'opencode',
		model: 'glm-4.7-free',
		description: 'GLM 4.7 through opencode zen'
	},
	{
		provider: 'opencode',
		model: 'big-pickle',
		description: 'Big Pickle, surprisingly good (and free)'
	},
	{
		provider: 'opencode',
		model: 'kimi-k2',
		description: 'Kimi K2, no reasoning'
	}
];

interface BlessedModelSelectProps {
	onClose: () => void;
}

export const BlessedModelSelect = (props: BlessedModelSelectProps) => {
	const config = useConfigContext();
	const messages = useMessagesContext();

	const [selectedIndex, setSelectedIndex] = useState(0);

	const currentModelIndex = useMemo(() => {
		return BLESSED_MODELS.findIndex(
			(m) => m.provider === config.selectedProvider && m.model === config.selectedModel
		);
	}, [config.selectedProvider, config.selectedModel]);

	const handleSelect = async () => {
		const selectedModel = BLESSED_MODELS[selectedIndex];
		if (!selectedModel) return;

		const result = await Result.tryPromise(() =>
			services.updateModel(selectedModel.provider, selectedModel.model)
		);
		if (result.isOk()) {
			config.setProvider(result.value.provider);
			config.setModel(result.value.model);
			messages.addSystemMessage(`Model updated: ${result.value.provider}/${result.value.model}`);
		} else {
			messages.addSystemMessage(`Error: ${formatError(result.error)}`);
		}
		props.onClose();
	};

	useKeyboard((key) => {
		switch (key.name) {
			case 'escape':
				props.onClose();
				break;
			case 'up':
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : BLESSED_MODELS.length - 1));
				break;
			case 'down':
				setSelectedIndex((prev) => (prev < BLESSED_MODELS.length - 1 ? prev + 1 : 0));
				break;
			case 'return':
				void handleSelect();
				break;
		}
	});

	return (
		<box
			style={{
				position: 'absolute',
				bottom: 4,
				left: 0,
				width: '100%',
				zIndex: 100,
				backgroundColor: colors.bgSubtle,
				border: true,
				borderColor: colors.accent,
				flexDirection: 'column',
				padding: 1
			}}
		>
			<text fg={colors.accent} content=" Select Model" />
			<text
				fg={colors.textMuted}
				content=" Use arrow keys to navigate, Enter to select, Esc to cancel"
			/>
			<text content="" style={{ height: 1 }} />
			{BLESSED_MODELS.map((model, i) => {
				const isSelected = i === selectedIndex;
				const isCurrent = i === currentModelIndex;
				return (
					<box key={`${model.provider}/${model.model}`} style={{ flexDirection: 'row' }}>
						<text
							fg={isSelected ? colors.accent : colors.text}
							content={isSelected ? '> ' : '  '}
						/>
						<text
							fg={isSelected ? colors.accent : colors.text}
							content={`${model.provider}/${model.model}`}
							style={{ width: 30 }}
						/>
						<text
							fg={isCurrent ? colors.success : colors.textSubtle}
							content={isCurrent ? `${model.description} (current)` : model.description}
						/>
					</box>
				);
			})}
		</box>
	);
};
