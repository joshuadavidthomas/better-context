import { Effect, Layer } from 'effect';

export class CliProcess extends Effect.Tag('CliProcess')<
	CliProcess,
	{
		readonly exit: (code: number) => never;
	}
>() {}

export const CliProcessLive = Layer.succeed(CliProcess, {
	exit: (code) => process.exit(code)
});
