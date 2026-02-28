import { Command, Options } from '@effect/cli';
import { BunContext } from '@effect/platform-bun';
import { Cause, Effect, Exit, Option, pipe } from 'effect';
import { runClearCommand } from '../commands/clear.ts';
import { runResourcesCommand } from '../commands/resources.ts';
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

const root = pipe(Command.make('btca'), Command.withSubcommands([clear, resources, status]));

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
