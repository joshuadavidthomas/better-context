const rootFlagsWithValue = new Set(['--server', '--port']);
const rootRuntimeFlags = new Set([
	'--server',
	'--port',
	'--no-tui',
	'--tui',
	'--no-thinking',
	'--thinking',
	'--no-tools',
	'--tools',
	'--sub-agent'
]);

const serverAwareSubcommands = new Set([
	'add',
	'ask',
	'clear',
	'connect',
	'disconnect',
	'mcp',
	'remove',
	'resources'
]);

const askCompatibilityFlags = new Set([
	'--no-thinking',
	'--thinking',
	'--no-tools',
	'--tools',
	'--sub-agent'
]);

export const firstOperand = (args: readonly string[]): string | null => {
	for (let i = 0; i < args.length; i += 1) {
		const token = args[i]!;
		if (token === '--') return null;
		if (!token.startsWith('-')) return token;
		if (rootFlagsWithValue.has(token)) {
			i += 1;
		}
	}

	return null;
};

export const normalizeCliArgv = (args: readonly string[]): string[] => {
	const normalized = [...args];

	if (normalized.length === 1 && normalized[0] === '-v') {
		return ['--version'];
	}

	const subcommandIndex = normalized.findIndex(
		(token, index) =>
			!token.startsWith('-') && (index === 0 || !rootFlagsWithValue.has(normalized[index - 1]!))
	);

	if (subcommandIndex <= 0) {
		return normalized;
	}

	const subcommand = normalized[subcommandIndex]!;
	const leadingFlags = normalized.slice(0, subcommandIndex);
	const trailingArgs = normalized.slice(subcommandIndex + 1);

	const movedToSubcommand: string[] = [];
	const keptAtRoot: string[] = [];

	for (let i = 0; i < leadingFlags.length; i += 1) {
		const token = leadingFlags[i]!;
		if (!rootRuntimeFlags.has(token)) {
			keptAtRoot.push(token);
			continue;
		}

		if (rootFlagsWithValue.has(token)) {
			const value = leadingFlags[i + 1];
			if (serverAwareSubcommands.has(subcommand) && value) {
				movedToSubcommand.push(token, value);
			}
			i += 1;
			continue;
		}

		if (subcommand === 'ask' && askCompatibilityFlags.has(token)) {
			movedToSubcommand.push(token);
			continue;
		}
	}

	return [...keptAtRoot, subcommand, ...movedToSubcommand, ...trailingArgs];
};
