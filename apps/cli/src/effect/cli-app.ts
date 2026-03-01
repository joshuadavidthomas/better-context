import { BunServices } from '@effect/platform-bun';
import { Cause, Effect, Exit, Option, pipe } from 'effect';
import { Argument, CliOutput, Command, Flag } from 'effect/unstable/cli';
import { runAddCommand } from '../commands/add.ts';
import { runAskCommand } from '../commands/ask.ts';
import { runClearCommand } from '../commands/clear.ts';
import { runConnectCommand } from '../commands/connect.ts';
import { runDisconnectCommand } from '../commands/disconnect.ts';
import { runInitCommand } from '../commands/init.ts';
import { runMcpConfigureLocalCommand, runMcpServerCommand } from '../commands/mcp.ts';
import { runReferenceCommand } from '../commands/reference.ts';
import { runRemoveCommand } from '../commands/remove.ts';
import { runResourcesCommand } from '../commands/resources.ts';
import { runServeCommand } from '../commands/serve.ts';
import { runSkillCommand } from '../commands/skill.ts';
import { runStatusCommand } from '../commands/status.ts';
import {
	runTelemetryOffCommand,
	runTelemetryOnCommand,
	runTelemetryStatusCommand
} from '../commands/telemetry.ts';
import { runWipeCommand } from '../commands/wipe.ts';
import { normalizeCliArgv } from './argv.ts';
import { formatCliCommandError } from './errors.ts';

const serverFlag = pipe(Flag.string('server'), Flag.optional);
const portFlag = pipe(Flag.integer('port'), Flag.optional);
const noThinkingFlag = pipe(Flag.boolean('no-thinking'), Flag.optional);
const noToolsFlag = pipe(Flag.boolean('no-tools'), Flag.optional);

const resolveServerOptions = ({
	server,
	port
}: {
	server: Option.Option<string>;
	port: Option.Option<number>;
}) => ({
	server: Option.getOrUndefined(server),
	port: Option.getOrUndefined(port),
	quiet: true
});

const clear = Command.make('clear', { server: serverFlag, port: portFlag }, ({ server, port }) =>
	Effect.tryPromise(() => runClearCommand(resolveServerOptions({ server, port })))
);
const add = Command.make(
	'add',
	{
		reference: pipe(Argument.string('reference'), Argument.optional),
		global: pipe(Flag.boolean('global'), Flag.withAlias('g')),
		name: pipe(Flag.string('name'), Flag.withAlias('n'), Flag.optional),
		branch: pipe(Flag.string('branch'), Flag.withAlias('b'), Flag.optional),
		searchPath: pipe(Flag.string('search-path'), Flag.withAlias('s'), Flag.atLeast(0)),
		notes: pipe(Flag.string('notes'), Flag.optional),
		type: pipe(Flag.string('type'), Flag.withAlias('t'), Flag.optional),
		server: serverFlag,
		port: portFlag
	},
	({ reference, global, name, branch, searchPath, notes, type, server, port }) =>
		Effect.tryPromise(() =>
			runAddCommand({
				reference: Option.getOrUndefined(reference),
				global,
				name: Option.getOrUndefined(name),
				branch: Option.getOrUndefined(branch),
				searchPath: [...searchPath],
				notes: Option.getOrUndefined(notes),
				type: Option.getOrUndefined(type),
				globalOpts: resolveServerOptions({ server, port })
			})
		)
);
const ask = Command.make(
	'ask',
	{
		question: pipe(Flag.string('question'), Flag.withAlias('q')),
		resource: pipe(Flag.string('resource'), Flag.withAlias('r'), Flag.atLeast(0)),
		thinking: pipe(Flag.boolean('thinking'), Flag.optional),
		noThinking: noThinkingFlag,
		tools: pipe(Flag.boolean('tools'), Flag.optional),
		noTools: noToolsFlag,
		subAgent: pipe(Flag.boolean('sub-agent'), Flag.optional),
		server: serverFlag,
		port: portFlag
	},
	({ question, resource, thinking, noThinking, tools, noTools, subAgent, server, port }) =>
		Effect.tryPromise(() =>
			runAskCommand({
				question,
				resource: [...resource],
				thinking: Option.getOrUndefined(noThinking) ? false : Option.getOrUndefined(thinking),
				tools: Option.getOrUndefined(noTools) ? false : Option.getOrUndefined(tools),
				subAgent: Option.getOrUndefined(subAgent),
				globalOpts: resolveServerOptions({ server, port })
			})
		)
);

const resources = Command.make(
	'resources',
	{ server: serverFlag, port: portFlag },
	({ server, port }) =>
		Effect.tryPromise(() => runResourcesCommand(resolveServerOptions({ server, port })))
);

const status = Command.make(
	'status',
	{ server: serverFlag, port: portFlag },
	({ server, port }) =>
		Effect.tryPromise(() => runStatusCommand(resolveServerOptions({ server, port })))
);
const init = Command.make(
	'init',
	{
		force: pipe(Flag.boolean('force'), Flag.withAlias('f'))
	},
	({ force }) => Effect.tryPromise(() => runInitCommand({ force }))
);
const mcp = pipe(
	Command.make(
		'mcp',
		{
			mode: pipe(Argument.string('mode'), Argument.optional),
			server: serverFlag,
			port: portFlag
		},
		({ mode, server, port }) =>
			Effect.tryPromise(() => {
				const selectedMode = Option.getOrUndefined(mode);
				if (!selectedMode) {
					return runMcpServerCommand({ globalOpts: resolveServerOptions({ server, port }) });
				}
				if (selectedMode === 'local') {
					return runMcpConfigureLocalCommand();
				}
				throw new Error(`Unknown mcp mode "${selectedMode}". Use "local" or omit it.`);
			})
	)
);
const connect = Command.make(
	'connect',
	{
		global: pipe(Flag.boolean('global'), Flag.withAlias('g')),
		provider: pipe(Flag.string('provider'), Flag.withAlias('p'), Flag.optional),
		model: pipe(Flag.string('model'), Flag.withAlias('m'), Flag.optional),
		server: serverFlag,
		port: portFlag
	},
	({ global, provider, model, server, port }) =>
		Effect.tryPromise(() =>
			runConnectCommand({
				global,
				provider: Option.getOrUndefined(provider),
				model: Option.getOrUndefined(model),
				globalOpts: resolveServerOptions({ server, port })
			})
		)
);
const disconnect = Command.make(
	'disconnect',
	{
		provider: pipe(Flag.string('provider'), Flag.withAlias('p'), Flag.optional),
		server: serverFlag,
		port: portFlag
	},
	({ provider, server, port }) =>
		Effect.tryPromise(() =>
			runDisconnectCommand({
				provider: Option.getOrUndefined(provider),
				globalOpts: resolveServerOptions({ server, port })
			})
		)
);
const reference = Command.make(
	'reference',
	{
		repo: Argument.string('repo')
	},
	({ repo }) => Effect.tryPromise(() => runReferenceCommand(repo))
);
const serve = Command.make(
	'serve',
	{
		port: pipe(Flag.integer('port'), Flag.withAlias('p'), Flag.optional)
	},
	({ port }) => Effect.tryPromise(() => runServeCommand({ port: Option.getOrUndefined(port) }))
);
const remove = Command.make(
	'remove',
	{
		name: pipe(Argument.string('name'), Argument.optional),
		global: pipe(Flag.boolean('global'), Flag.withAlias('g')),
		server: serverFlag,
		port: portFlag
	},
	({ name, global, server, port }) =>
		Effect.tryPromise(() =>
			runRemoveCommand({
				name: Option.getOrUndefined(name),
				global,
				globalOpts: resolveServerOptions({ server, port })
			})
		)
);
const skill = Command.make('skill', {}, () => Effect.tryPromise(() => runSkillCommand()));
const telemetry = pipe(
	Command.make('telemetry'),
	Command.withSubcommands([
		Command.make('on', {}, () => Effect.tryPromise(() => runTelemetryOnCommand())),
		Command.make('off', {}, () => Effect.tryPromise(() => runTelemetryOffCommand())),
		Command.make('status', {}, () => Effect.tryPromise(() => runTelemetryStatusCommand()))
	])
);
const wipe = Command.make(
	'wipe',
	{
		yes: pipe(Flag.boolean('yes'), Flag.withAlias('y'))
	},
	({ yes }) => Effect.tryPromise(() => runWipeCommand({ yes }))
);

const root = pipe(
	Command.make('btca'),
	Command.withSubcommands([
		add,
		ask,
		clear,
		connect,
		disconnect,
		init,
		mcp,
		reference,
		resources,
		status,
		skill,
		serve,
		telemetry,
		remove,
		wipe
	])
);

export const runEffectCli = async (
	argv: ReadonlyArray<string>,
	version: string
): Promise<number> => {
	let hadCliErrors = false;
	const defaultFormatter = CliOutput.defaultFormatter();
	const formatter: ReturnType<typeof CliOutput.defaultFormatter> = {
		...defaultFormatter,
		formatError: (error) => {
			hadCliErrors = true;
			return defaultFormatter.formatError(error);
		},
		formatErrors: (errors) => {
			if (errors.length > 0) hadCliErrors = true;
			return defaultFormatter.formatErrors(errors);
		}
	};

	const run = Command.runWith(root, { version });
	const cliEffect = run(normalizeCliArgv(argv.slice(2))).pipe(
		Effect.provide(CliOutput.layer(formatter)),
		Effect.provide(BunServices.layer)
	);
	const exit = await Effect.runPromiseExit(cliEffect);
	if (Exit.isFailure(exit)) {
		console.error(formatCliCommandError(Cause.squash(exit.cause)));
		return 1;
	}
	if (hadCliErrors) return 1;
	return 0;
};
