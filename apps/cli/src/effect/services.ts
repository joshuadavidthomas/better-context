import { Layer, ServiceMap } from 'effect';

export class CliProcess extends ServiceMap.Service<
	CliProcess,
	{
		readonly exit: (code: number) => never;
	}
>()('CliProcess') {}

export const makeCliProcessLayer = (exit: (code: number) => never) =>
	Layer.succeed(CliProcess, { exit });
