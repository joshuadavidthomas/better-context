import { Args, Command, Options } from '@effect/cli';
import { BunContext } from '@effect/platform-bun';
import { Cause, Effect, Exit, Option, pipe } from 'effect';
import { runClearCommand } from '../commands/clear.ts';
import { runRemoveCommand } from '../commands/remove.ts';
import { runResourcesCommand } from '../commands/resources.ts';
import { runServeCommand } from '../commands/serve.ts';
import { runStatusCommand } from '../commands/status.ts';
import { formatCliCommandError } from './errors.ts';

const serverOption = Options.text('server').pipe(Options.optional);
const portOption = Options.integer('port').pipe(Options.optional);

const resolveServerOptions = (options: {
	server: Option.Option<string>;
	port: Option.Option<number>;
}) => ({
	serverUrl: Option.getOrUndefined(options.server),
	port: Option.getOrUndefined(options.port),
	quiet: true
});

const clear = Command.make(
	'clear',
	{ server: serverOption, port: portOption },
	({ server, port }) =>
		Effect.tryPromise(() => runClearCommand(resolveServerOptions({ server, port })))
);

const resources = Command.make(
	'resources',
	{ server: serverOption, port: portOption },
	({ server, port }) =>
		Effect.tryPromise(() => runResourcesCommand(resolveServerOptions({ server, port })))
);

const status = Command.make('status', {}, () => Effect.tryPromise(() => runStatusCommand()));
const serve = Command.make(
	'serve',
	{
		port: Options.integer('port').pipe(Options.withAlias('p'), Options.optional)
	},
	({ port }) => Effect.tryPromise(() => runServeCommand({ port: Option.getOrUndefined(port) }))
);
const remove = Command.make(
	'remove',
	{
		name: Args.text({ name: 'name' }).pipe(Args.optional),
		global: Options.boolean('global').pipe(Options.withAlias('g')),
		server: serverOption,
		port: portOption
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

const root = pipe(
	Command.make('btca'),
	Command.withSubcommands([clear, resources, status, serve, remove])
);

export const runEffectCli = async (
	argv: ReadonlyArray<string>,
	version: string
): Promise<void> => {
	const run = Command.run(root, {
		name: 'btca',
		version
	});
	const exit = await Effect.runPromiseExit(run(argv).pipe(Effect.provide(BunContext.layer)));
	if (Exit.isFailure(exit)) {
		console.error(formatCliCommandError(Cause.squash(exit.cause)));
		process.exit(1);
	}
};
