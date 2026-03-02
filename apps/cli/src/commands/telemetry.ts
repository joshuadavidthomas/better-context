import { Effect } from 'effect';
import { getTelemetryStatus, setTelemetryEnabled } from '../lib/telemetry.ts';

const formatStatus = (status: {
	envDisabled: boolean;
	enabled: boolean;
	distinctId: string | null;
}) => {
	if (status.envDisabled) {
		return 'Telemetry is disabled via BTCA_TELEMETRY=0.';
	}
	if (!status.enabled) {
		return 'Telemetry is disabled.';
	}
	return `Telemetry is enabled.\nAnonymous ID: ${status.distinctId ?? 'pending'}`;
};

export const runTelemetryOnCommand = () =>
	Effect.tryPromise(async () => {
		const config = await setTelemetryEnabled(true);
		console.log('Telemetry enabled.');
		console.log(`Anonymous ID: ${config.distinctId}`);
	});

export const runTelemetryOffCommand = () =>
	Effect.tryPromise(async () => {
		await setTelemetryEnabled(false);
		console.log('Telemetry disabled.');
	});

export const runTelemetryStatusCommand = () =>
	Effect.tryPromise(async () => {
		const status = await getTelemetryStatus();
		console.log(formatStatus(status));
	});
