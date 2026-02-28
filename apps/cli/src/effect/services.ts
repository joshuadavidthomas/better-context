import { Layer, ServiceMap } from 'effect';

export class CliProcess extends ServiceMap.Service<
	CliProcess,
	{
		readonly exit: (code: number) => never;
	}
>()('CliProcess') {}

export const CliProcessLive = Layer.succeed(CliProcess, {
	exit: (code: number) => process.exit(code)
});
