import { Effect } from 'effect';
import { launchRepl } from './commands/repl.ts';
import { launchTui } from './commands/tui.ts';
import { runEffectCli } from './effect/cli-app.ts';
import { formatCliError } from './effect/errors.ts';
import { createCliRuntime } from './effect/runtime.ts';
import { setTelemetryContext } from './lib/telemetry.ts';
import packageJson from '../package.json';

// Version is injected at build time via Bun's define option
// The __VERSION__ global is replaced with the actual version string during compilation
// Falls back to package.json for dev mode, or 0.0.0 if unavailable
declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : (packageJson.version ?? '0.0.0');
setTelemetryContext({ cliVersion: VERSION });

const knownCommands = new Set([
	'add',
	'ask',
	'clear',
	'connect',
	'disconnect',
	'init',
	'mcp',
	'reference',
	'remove',
	'resources',
	'serve',
	'skill',
	'status',
	'telemetry',
	'wipe'
]);

const distance = (left: string, right: string): number => {
	const matrix = Array.from({ length: left.length + 1 }, () =>
		Array.from({ length: right.length + 1 }, () => 0)
	);

	for (let col = 1; col <= right.length; col += 1) {
		matrix[0]![col] = col;
	}

	for (let row = 1; row <= left.length; row += 1) {
		matrix[row]![0] = row;
	}

	for (let row = 1; row <= left.length; row += 1) {
		for (let col = 1; col <= right.length; col += 1) {
			const currentRow = matrix[row]!;
			const previousRow = matrix[row - 1]!;

			currentRow[col] =
				left[row - 1] === right[col - 1]
					? previousRow[col - 1]!
					: Math.min(previousRow[col]! + 1, currentRow[col - 1]! + 1, previousRow[col - 1]! + 1);
		}
	}

	return matrix[left.length]![right.length]!;
};

const suggestCommand = (token: string) => {
	let suggestion: string | null = null;
	let bestDistance = Infinity;

	for (const command of knownCommands) {
		const nextDistance = distance(token, command);
		if (nextDistance < bestDistance) {
			suggestion = command;
			bestDistance = nextDistance;
		}
	}

	return bestDistance <= 2 ? suggestion : null;
};

const firstOperand = (): string | null => {
	const args = process.argv.slice(2);
	const flagsWithValue = new Set(['--server', '--port']);

	for (let i = 0; i < args.length; i += 1) {
		const token = args[i]!;
		if (token === '--') return null;
		if (!token.startsWith('-')) return token;
		if (flagsWithValue.has(token)) {
			i += 1;
		}
	}

	return null;
};

const unknownTopLevelCommand = () => {
	const token = firstOperand();
	if (token === null) return null;
	return knownCommands.has(token) ? null : token;
};

const handleUnknownTopLevelCommand = (token: string) => {
	const suggestion = suggestCommand(token);
	const hint = suggestion ? ` (Did you mean '${suggestion}'?)` : '';
	console.error(`error: unknown command '${token}'${hint}`);
	process.exit(1);
};

const token = unknownTopLevelCommand();

if (token !== null) {
	handleUnknownTopLevelCommand(token);
}

const rootArgs = process.argv.slice(2);
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

const shouldDelegateRoot = () => {
	for (let i = 0; i < rootArgs.length; i += 1) {
		const token = rootArgs[i]!;
		if (!token.startsWith('-')) return false;
		if (token === '--server' || token === '--port') {
			i += 1;
			continue;
		}
		if (rootRuntimeFlags.has(token)) continue;
		return true;
	}
	return false;
};

const parseRootLaunchOptions = () => {
	const options: {
		server?: string;
		port?: number;
		tui: boolean;
		thinking: boolean;
		tools: boolean;
		subAgent: boolean;
	} = {
		tui: true,
		thinking: true,
		tools: true,
		subAgent: false
	};

	for (let i = 0; i < rootArgs.length; i += 1) {
		const token = rootArgs[i]!;
		if (token === '--server') {
			options.server = rootArgs[i + 1];
			i += 1;
			continue;
		}
		if (token === '--port') {
			const value = rootArgs[i + 1];
			if (value) options.port = Number.parseInt(value, 10);
			i += 1;
			continue;
		}
		if (token === '--no-tui') options.tui = false;
		if (token === '--tui') options.tui = true;
		if (token === '--no-thinking') options.thinking = false;
		if (token === '--thinking') options.thinking = true;
		if (token === '--no-tools') options.tools = false;
		if (token === '--tools') options.tools = true;
		if (token === '--sub-agent') options.subAgent = true;
	}

	return options;
};

if (firstOperand() === null && !shouldDelegateRoot()) {
	const runtime = createCliRuntime();
	const launchOptions = parseRootLaunchOptions();
	const launchEffect = Effect.tryPromise(async () => {
		if (launchOptions.tui === false) {
			await launchRepl(launchOptions);
			return;
		}
		await launchTui(launchOptions);
	});

	try {
		await runtime.runPromise(launchEffect);
	} catch (error) {
		console.error('Error:', formatCliError(error));
		process.exit(1);
	} finally {
		await runtime.dispose();
	}
} else {
	await runEffectCli(process.argv, VERSION);
}
