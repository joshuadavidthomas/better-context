const POSTHOG_KEY = 'phc_aUZcaccxNs56PokvsvIInqHCrwjUjvpiMWih9P86cTV';
const POSTHOG_HOST = 'https://us.i.posthog.com';
const TELEMETRY_ENV_FLAG = 'BTCA_TELEMETRY';
const TELEMETRY_CONFIG_DIR = '~/.config/btca';
const TELEMETRY_FILENAME = 'telemetry.json';
const TELEMETRY_TIMEOUT_MS = 1000;

const expandHome = (filePath: string) => {
	const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
	if (filePath.startsWith('~/')) return home + filePath.slice(1);
	return filePath;
};

const getTelemetryPath = () => `${expandHome(TELEMETRY_CONFIG_DIR)}/${TELEMETRY_FILENAME}`;

type TelemetryConfig = {
	enabled: boolean;
	distinctId: string;
};

type TelemetryContext = {
	provider?: string;
	model?: string;
	cliVersion?: string;
};

type TrackedCliCommandArgs<T> = {
	command: string;
	mode: string;
	eventName?: string;
	startProperties?: Record<string, unknown>;
	successProperties?: (result: T) => Record<string, unknown> | undefined;
	failureProperties?: (error: unknown) => Record<string, unknown> | undefined;
	action: () => Promise<T>;
};

let telemetryContext: TelemetryContext = {};

export const setTelemetryContext = (next: TelemetryContext) => {
	telemetryContext = { ...telemetryContext, ...next };
};

const isEnvDisabled = () => process.env[TELEMETRY_ENV_FLAG] === '0';

const createDefaultConfig = (): TelemetryConfig => ({
	enabled: true,
	distinctId: crypto.randomUUID()
});

const normalizeConfig = (raw: unknown) => {
	const candidate = raw as Partial<TelemetryConfig> | null;
	const enabled = typeof candidate?.enabled === 'boolean' ? candidate.enabled : true;
	const distinctId =
		typeof candidate?.distinctId === 'string' && candidate.distinctId.trim().length > 0
			? candidate.distinctId
			: crypto.randomUUID();

	const config = { enabled, distinctId };
	const needsSave =
		candidate?.enabled !== enabled ||
		typeof candidate?.distinctId !== 'string' ||
		candidate?.distinctId !== distinctId;

	return { config, needsSave };
};

const readTelemetryConfig = async () => {
	const path = getTelemetryPath();
	const file = Bun.file(path);
	if (!(await file.exists())) return null;

	try {
		const text = await file.text();
		const parsed = JSON.parse(text) as unknown;
		return normalizeConfig(parsed);
	} catch {
		return null;
	}
};

const ensureConfigDir = async (configDir: string) => {
	try {
		const fs = await import('node:fs/promises');
		await fs.mkdir(configDir, { recursive: true });
	} catch {
		// Ignore directory creation errors
	}
};

const saveTelemetryConfig = async (config: TelemetryConfig) => {
	const path = getTelemetryPath();
	const configDir = path.slice(0, path.lastIndexOf('/'));
	await ensureConfigDir(configDir);
	await Bun.write(`${configDir}/.keep`, '');
	await Bun.write(path, JSON.stringify(config, null, 2));
};

const getOrCreateTelemetryConfig = async () => {
	const existing = await readTelemetryConfig();
	if (existing) {
		if (existing.needsSave) {
			await saveTelemetryConfig(existing.config);
		}
		return existing.config;
	}

	const created = createDefaultConfig();
	await saveTelemetryConfig(created);
	return created;
};

export const setTelemetryEnabled = async (enabled: boolean) => {
	const existing = await readTelemetryConfig();
	const config = existing?.config ?? createDefaultConfig();
	const next = { ...config, enabled };
	await saveTelemetryConfig(next);
	return next;
};

export const getTelemetryStatus = async () => {
	const envDisabled = isEnvDisabled();
	const existing = await readTelemetryConfig();
	return {
		envDisabled,
		enabled: existing?.config.enabled ?? true,
		hasConfig: Boolean(existing),
		distinctId: existing?.config.distinctId ?? null
	};
};

const buildProperties = (properties?: Record<string, unknown>) => {
	const base: Record<string, unknown> = {
		cliVersion: telemetryContext.cliVersion,
		os: process.platform,
		arch: process.arch,
		anonymous: true
	};

	if (telemetryContext.provider) base.provider = telemetryContext.provider;
	if (telemetryContext.model) base.model = telemetryContext.model;

	return { ...base, ...(properties ?? {}) };
};

const posthogCapture = async (payload: Record<string, unknown>) => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS);

	try {
		await fetch(`${POSTHOG_HOST}/capture`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload),
			signal: controller.signal
		});
	} catch {
		// Ignore telemetry errors
	} finally {
		clearTimeout(timeout);
	}
};

export const trackTelemetryEvent = async (args: {
	event: string;
	properties?: Record<string, unknown>;
}) => {
	if (isEnvDisabled()) return;
	if (!POSTHOG_KEY) return;

	try {
		const config = await getOrCreateTelemetryConfig();
		if (!config.enabled) return;

		const payload = {
			api_key: POSTHOG_KEY,
			event: args.event,
			distinct_id: config.distinctId,
			properties: buildProperties(args.properties)
		};

		await posthogCapture(payload);
	} catch {
		// Ignore telemetry errors
	}
};

export const runTrackedCliCommand = async <T>({
	command,
	mode,
	eventName = mode,
	startProperties,
	successProperties,
	failureProperties,
	action
}: TrackedCliCommandArgs<T>) => {
	const startedAt = Date.now();
	const baseProperties = { command, mode, ...(startProperties ?? {}) };

	await trackTelemetryEvent({
		event: 'cli_started',
		properties: baseProperties
	});
	await trackTelemetryEvent({
		event: `cli_${eventName}_started`,
		properties: baseProperties
	});

	try {
		const result = await action();
		await trackTelemetryEvent({
			event: `cli_${eventName}_completed`,
			properties: {
				...baseProperties,
				durationMs: Date.now() - startedAt,
				exitCode: 0,
				...(successProperties?.(result) ?? {})
			}
		});
		return result;
	} catch (error) {
		await trackTelemetryEvent({
			event: `cli_${eventName}_failed`,
			properties: {
				...baseProperties,
				durationMs: Date.now() - startedAt,
				errorName: error instanceof Error ? error.name : 'UnknownError',
				exitCode: 1,
				...(failureProperties?.(error) ?? {})
			}
		});
		throw error;
	}
};
