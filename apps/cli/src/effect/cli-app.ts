import { BunServices } from '@effect/platform-bun';
import { Cause, Effect, Exit, Option, pipe } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { runClearCommand } from '../commands/clear.ts';
import { runConnectCommand } from '../commands/connect.ts';
import { runDisconnectCommand } from '../commands/disconnect.ts';
import { runInitCommand } from '../commands/init.ts';
import { runReferenceCommand } from '../commands/reference.ts';
import { runRemoveCommand } from '../commands/remove.ts';
import { runResourcesCommand } from '../commands/resources.ts';
import { runServeCommand } from '../commands/serve.ts';
import { runStatusCommand } from '../commands/status.ts';
import {
	runTelemetryOffCommand,
	runTelemetryOnCommand,
	runTelemetryStatusCommand
} from '../commands/telemetry.ts';
import { runWipeCommand } from '../commands/wipe.ts';
import { formatCliCommandError } from './errors.ts';

const serverFlag = pipe(Flag.string('server'), Flag.optional);
const portFlag = pipe(Flag.integer('port'), Flag.optional);

const resolveServerOptions = ({
	server,
	port
}: {
	server: Option.Option<string>;
	port: Option.Option<number>;
}) => ({
	serverUrl: Option.getOrUndefined(server),
	port: Option.getOrUndefined(port),
	quiet: true
});

const clear = Command.make(
	'clear',
	{ server: serverFlag, port: portFlag },
	({ server, port }) =>
		Effect.tryPromise(() => runClearCommand(resolveServerOptions({ server, port })))
);

const resources = Command.make(
	'resources',
	{ server: serverFlag, port: portFlag },
	({ server, port }) =>
		Effect.tryPromise(() => runResourcesCommand(resolveServerOptions({ server, port })))
);

const status = Command.make('status', {}, () => Effect.tryPromise(() => runStatusCommand()));
const init = Command.make(
	'init',
	{
		force: pipe(Flag.boolean('force'), Flag.withAlias('f'))
	},
	({ force }) => Effect.tryPromise(() => runInitCommand({ force }))
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
		clear,
		connect,
		disconnect,
		init,
		reference,
		resources,
		status,
		serve,
		telemetry,
		remove,
		wipe
	])
);

export const runEffectCli = async (
	argv: ReadonlyArray<string>,
	version: string
): Promise<void> => {
	const run = Command.runWith(root, { version });
	const cliEffect = run(argv.slice(2)).pipe(Effect.provide(BunServices.layer));
	const exit = await Effect.runPromiseExit(cliEffect);
	if (Exit.isFailure(exit)) {
		console.error(formatCliCommandError(Cause.squash(exit.cause)));
		process.exit(1);
	}
};
