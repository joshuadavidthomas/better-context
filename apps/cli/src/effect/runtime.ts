import { Effect, Layer, ManagedRuntime } from 'effect';
import type * as Exit from 'effect/Exit';

const RuntimeLayer = Layer.empty;

export interface CliRuntime {
	runPromise: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
	runPromiseExit: <A, E>(effect: Effect.Effect<A, E>) => Promise<Exit.Exit<A, E>>;
	dispose: () => Promise<void>;
}

export const createCliRuntime = (): CliRuntime => {
	const runtime = ManagedRuntime.make(RuntimeLayer);
	return {
		runPromise: (effect) => runtime.runPromise(effect),
		runPromiseExit: (effect) => runtime.runPromiseExit(effect),
		dispose: () => runtime.dispose()
	};
};
