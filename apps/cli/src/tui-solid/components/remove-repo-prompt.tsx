import { Show, For, type Component } from 'solid-js';
import { colors } from '../theme.ts';
import { useKeyboard } from '@opentui/solid';
import { useAppContext } from '../context/app-context.tsx';
import { services } from '../services.ts';

export const RemoveRepoPrompt: Component = () => {
	const appState = useAppContext();

	const handleRemoveRepo = async () => {
		const repoName = appState.removeRepoName();
		if (!repoName) return;

		try {
			await services.removeRepo(repoName);
			appState.removeRepo(repoName);
			appState.addMessage({ role: 'system', content: `Removed repo: ${repoName}` });
		} catch (error) {
			appState.addMessage({ role: 'system', content: `Error: ${error}` });
		} finally {
			appState.setMode('chat');
			appState.setRemoveRepoName('');
		}
	};

	const cancelMode = () => {
		appState.setMode('chat');
		appState.setRemoveRepoName('');
	};

	useKeyboard((key) => {
		if (key.name === 'escape') {
			cancelMode();
		} else if (appState.removeRepoName()) {
			if (key.name === 'y' || key.raw === 'Y') {
				handleRemoveRepo();
			} else if (key.name === 'n' || key.raw === 'N') {
				cancelMode();
			}
		}
	});

	return (
		<Show
			when={appState.removeRepoName()}
			fallback={
				<box
					style={{
						position: 'absolute',
						top: '50%',
						left: '50%',
						width: 50,
						backgroundColor: colors.bgSubtle,
						border: true,
						borderColor: colors.error,
						flexDirection: 'column',
						padding: 2
					}}
				>
					<text fg={colors.error} content=" Remove Repo" />
					<text content="" style={{ height: 1 }} />
					<text fg={colors.text} content=" Type repo name to remove:" />
					<text content="" style={{ height: 1 }} />
					<For each={appState.repos()}>
						{(repo) => <text fg={colors.textSubtle} content={`  @${repo.name}`} />}
					</For>
					<text content="" style={{ height: 1 }} />
					<input
						placeholder="repo name"
						placeholderColor={colors.textSubtle}
						textColor={colors.text}
						value=""
						onInput={(value) => {
							// Don't update state here, just capture
						}}
						onSubmit={(value) => {
							const repo = appState.repos().find((r) => r.name.toLowerCase() === value.toLowerCase());
							if (repo) {
								appState.setRemoveRepoName(repo.name);
							}
						}}
						focused={true}
						style={{ height: 1, width: '100%', marginTop: 1 }}
					/>
				</box>
			}
		>
			<box
				style={{
					position: 'absolute',
					bottom: 4,
					left: 0,
					width: '100%',
					zIndex: 100,
					backgroundColor: colors.bgSubtle,
					border: true,
					borderColor: colors.error,
					flexDirection: 'column',
					padding: 1
				}}
			>
				<text fg={colors.error} content=" Remove Repo" />
				<text content="" style={{ height: 1 }} />
				<text fg={colors.text}>
					{`Are you sure you want to remove "`}
					<span style={{ fg: colors.accent }}>{appState.removeRepoName()}</span>
					{`" from your configuration?`}
				</text>
				<text content="" style={{ height: 1 }} />
				<box style={{ flexDirection: 'row' }}>
					<text fg={colors.success} content=" [Y] Yes, remove" />
					<text fg={colors.textSubtle} content="  " />
					<text fg={colors.textMuted} content="[N/Esc] Cancel" />
				</box>
			</box>
		</Show>
	);
};
