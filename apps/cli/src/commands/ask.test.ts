import { describe, expect, test } from 'bun:test';
import { registerSignalCleanup, streamErrorToBtcaError } from './ask.ts';

type SignalEvent = 'SIGINT' | 'SIGTERM' | 'exit';
type ForwardedSignal = 'SIGINT' | 'SIGTERM';

const createMockProcess = ({ throwOnKill = false } = {}) => {
	const listeners = new Map<SignalEvent, () => void>();
	const killCalls: Array<{ pid: number; signal: ForwardedSignal }> = [];
	const exitCalls: number[] = [];
	const offCalls: SignalEvent[] = [];

	const mock = {
		pid: 4242,
		once: (event: SignalEvent, listener: () => void) => {
			listeners.set(event, listener);
		},
		off: (event: SignalEvent, listener: () => void) => {
			offCalls.push(event);
			if (listeners.get(event) === listener) listeners.delete(event);
		},
		kill: (pid: number, signal: ForwardedSignal) => {
			killCalls.push({ pid, signal });
			if (throwOnKill) throw new Error('kill failed');
			return true;
		},
		exit: (code = 0) => {
			exitCalls.push(code);
		}
	};

	const emit = (event: SignalEvent) => {
		const listener = listeners.get(event);
		if (!listener) return;
		listeners.delete(event);
		listener();
	};

	return { mock, emit, listeners, killCalls, exitCalls, offCalls };
};

describe('registerSignalCleanup', () => {
	test('stops server and re-signals on SIGINT', () => {
		let stopCalls = 0;
		const proc = createMockProcess();
		const teardown = registerSignalCleanup(() => {
			stopCalls += 1;
		}, proc.mock);

		proc.emit('SIGINT');

		expect(stopCalls).toBe(1);
		expect(proc.killCalls).toEqual([{ pid: 4242, signal: 'SIGINT' }]);
		expect(proc.exitCalls).toEqual([]);
		expect(proc.listeners.size).toBe(0);

		teardown();
		expect(stopCalls).toBe(1);
	});

	test('falls back to signal-style exit code when kill throws', () => {
		let stopCalls = 0;
		const proc = createMockProcess({ throwOnKill: true });
		registerSignalCleanup(() => {
			stopCalls += 1;
		}, proc.mock);

		proc.emit('SIGTERM');

		expect(stopCalls).toBe(1);
		expect(proc.killCalls).toEqual([{ pid: 4242, signal: 'SIGTERM' }]);
		expect(proc.exitCalls).toEqual([143]);
	});

	test('teardown removes listeners and cleans up once', () => {
		let stopCalls = 0;
		const proc = createMockProcess();
		const teardown = registerSignalCleanup(() => {
			stopCalls += 1;
		}, proc.mock);

		teardown();
		teardown();
		proc.emit('SIGINT');

		expect(stopCalls).toBe(1);
		expect(proc.killCalls).toEqual([]);
		expect(proc.listeners.size).toBe(0);
		expect(proc.offCalls).toEqual(['SIGINT', 'SIGTERM', 'exit', 'SIGINT', 'SIGTERM', 'exit']);
	});
});

describe('streamErrorToBtcaError', () => {
	test('preserves explicit hint from stream error event', () => {
		const error = streamErrorToBtcaError('boom', 'UnknownError', 'use this hint');
		expect(error.message).toBe('boom');
		expect(error.hint).toBe('use this hint');
		expect(error.tag).toBe('UnknownError');
	});

	test('adds auth hint for unauthenticated provider stream errors', () => {
		const error = streamErrorToBtcaError(
			'Provider "opencode" is not authenticated.',
			'ProviderNotAuthenticatedError'
		);
		expect(error.message).toBe('Provider "opencode" is not authenticated.');
		expect(error.hint).toBe('run btca connect to authenticate and pick a model.');
		expect(error.tag).toBe('ProviderNotAuthenticatedError');
	});
});
