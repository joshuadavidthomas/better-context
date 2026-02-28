import { Effect, Exit, Layer, ManagedRuntime } from 'effect';

const RuntimeLayer = Layer.empty;

export interface ServerRuntime {
	runPromise: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
	runPromiseExit: <A, E>(effect: Effect.Effect<A, E>) => Promise<Exit.Exit<A, E>>;
	dispose: () => Promise<void>;
}

export const createServerRuntime = (): ServerRuntime => {
	const runtime = ManagedRuntime.make(RuntimeLayer);
	return {
		runPromise: (effect) => runtime.runPromise(effect),
		runPromiseExit: (effect) => runtime.runPromiseExit(effect),
		dispose: () => runtime.dispose()
	};
};
