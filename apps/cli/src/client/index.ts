import { Effect } from 'effect';

export type Client = {
	baseUrl: string;
};

export type ConfigResponse = {
	provider: string;
	model: string;
	providerTimeoutMs: number | null;
	maxSteps: number;
	resourcesDirectory: string;
	resourceCount: number;
};

export type ResourceRecord =
	| {
			type: 'git';
			name: string;
			url: string;
			branch: string;
			searchPath?: string | null;
			searchPaths?: string[] | null;
			specialNotes?: string | null;
	  }
	| {
			type: 'local';
			name: string;
			path: string;
			specialNotes?: string | null;
	  }
	| {
			type: 'npm';
			name: string;
			package: string;
			version?: string | null;
			specialNotes?: string | null;
	  };

export type ResourcesResponse = {
	resources: ResourceRecord[];
};

export type ProvidersResponse = {
	all: Array<{ id: string; models: Record<string, unknown> }>;
	connected: string[];
};

/**
 * Custom error class that carries hints from the server.
 */
export class BtcaError extends Error {
	readonly hint?: string;
	readonly tag?: string;

	constructor(message: string, options?: { hint?: string; tag?: string }) {
		super(message);
		this.name = 'BtcaError';
		this.hint = options?.hint;
		this.tag = options?.tag;
	}
}

/**
 * Parse error response from server and create a BtcaError.
 */
const parseErrorResponse = (
	res: Response,
	fallbackMessage: string
): Effect.Effect<BtcaError, never> => {
	const normalizeMessage = (message: string) => {
		if (message.startsWith('Unhandled exception:')) {
			const stripped = message.slice('Unhandled exception:'.length).trim();
			if (stripped.length > 0) return stripped;
		}
		if (message === 'match err handler threw' || message === 'match ok handler threw') {
			return 'Internal error while processing a result. Check the server logs for details.';
		}
		return message;
	};

	return Effect.match(
		Effect.tryPromise(() => res.json() as Promise<unknown>),
		{
			onFailure: () => new BtcaError(fallbackMessage),
			onSuccess: (body) => {
				if (!body || typeof body !== 'object') {
					return new BtcaError(fallbackMessage);
				}
				const parsed = body as { error?: string; hint?: string; tag?: string };
				return new BtcaError(normalizeMessage(parsed.error ?? fallbackMessage), {
					hint: parsed.hint,
					tag: parsed.tag
				});
			}
		}
	);
};

const requestJson = <T>(
	url: string,
	init: RequestInit | undefined,
	fallbackMessage: string
): Effect.Effect<T, BtcaError> =>
	Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () => fetch(url, init),
			catch: (error) => new BtcaError(String(error))
		});
		if (!response.ok) {
			const parsedError = yield* parseErrorResponse(
				response,
				`${fallbackMessage}: ${response.status}`
			);
			return yield* Effect.fail(parsedError);
		}
		return (yield* Effect.tryPromise({
			try: () => response.json() as Promise<T>,
			catch: (error) => new BtcaError(String(error))
		})) as T;
	});

const runClientEffect = <A>(effect: Effect.Effect<A, BtcaError>) => Effect.runPromise(effect);

/**
 * Create an HTTP client descriptor for the btca server
 */
export function createClient(baseUrl: string): Client {
	return { baseUrl };
}

/**
 * Get server configuration
 */
export async function getConfig(client: Client): Promise<ConfigResponse> {
	return runClientEffect(
		requestJson<ConfigResponse>(`${client.baseUrl}/config`, undefined, 'Failed to get config')
	);
}

/**
 * Get available resources
 */
export async function getResources(client: Client): Promise<ResourcesResponse> {
	return runClientEffect(
		requestJson<ResourcesResponse>(
			`${client.baseUrl}/resources`,
			undefined,
			'Failed to get resources'
		)
	);
}

export async function getProviders(client: Client): Promise<ProvidersResponse> {
	return runClientEffect(
		requestJson<ProvidersResponse>(
			`${client.baseUrl}/providers`,
			undefined,
			'Failed to get providers'
		)
	);
}

/**
 * Ask a question (non-streaming)
 */
export async function askQuestion(
	client: Client,
	options: {
		question: string;
		resources?: string[];
		quiet?: boolean;
	}
): Promise<{ answer: string; model: { provider: string; model: string } }> {
	return runClientEffect(
		requestJson<{ answer: string; model: { provider: string; model: string } }>(
			`${client.baseUrl}/question`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					question: options.question,
					resources: options.resources,
					quiet: options.quiet
				})
			},
			'Failed to ask question'
		)
	);
}

/**
 * Ask a question (streaming) - returns the raw Response for SSE parsing
 */
export async function askQuestionStream(
	baseUrl: string,
	options: {
		question: string;
		resources?: string[];
		quiet?: boolean;
		signal?: AbortSignal;
	}
): Promise<Response> {
	const res = await fetch(`${baseUrl}/question/stream`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			question: options.question,
			resources: options.resources,
			quiet: options.quiet
		}),
		signal: options.signal
	});

	if (!res.ok) {
		throw await Effect.runPromise(parseErrorResponse(res, `Failed to ask question: ${res.status}`));
	}

	return res;
}

/**
 * Update model configuration
 */
export type ProviderOptionsInput = {
	baseURL?: string;
	name?: string;
};

export type ModelUpdateResult = {
	provider: string;
	model: string;
	savedTo: 'project' | 'global';
};

export async function updateModel(
	baseUrl: string,
	provider: string,
	model: string,
	providerOptions?: ProviderOptionsInput
): Promise<ModelUpdateResult> {
	return runClientEffect(
		requestJson<ModelUpdateResult>(
			`${baseUrl}/config/model`,
			{
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					provider,
					model,
					...(providerOptions ? { providerOptions } : {})
				})
			},
			'Failed to update model'
		)
	);
}

export interface GitResourceInput {
	type: 'git';
	name: string;
	url: string;
	branch?: string;
	searchPath?: string;
	searchPaths?: string[];
	specialNotes?: string;
}

export interface LocalResourceInput {
	type: 'local';
	name: string;
	path: string;
	specialNotes?: string;
}

export interface NpmResourceInput {
	type: 'npm';
	name: string;
	package: string;
	version?: string;
	specialNotes?: string;
}

export type ResourceInput = GitResourceInput | LocalResourceInput | NpmResourceInput;

/**
 * Add a new resource
 */
export async function addResource(
	baseUrl: string,
	resource: ResourceInput
): Promise<ResourceInput> {
	return runClientEffect(
		requestJson<ResourceInput>(
			`${baseUrl}/config/resources`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(resource)
			},
			'Failed to add resource'
		)
	);
}

/**
 * Remove a resource
 */
export async function removeResource(baseUrl: string, name: string): Promise<void> {
	await runClientEffect(
		requestJson<{ success: boolean }>(
			`${baseUrl}/config/resources`,
			{
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ name })
			},
			'Failed to remove resource'
		)
	);
}

/**
 * Clear all locally cloned resources
 */
export async function clearResources(baseUrl: string): Promise<{ cleared: number }> {
	return runClientEffect(
		requestJson<{ cleared: number }>(
			`${baseUrl}/clear`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			},
			'Failed to clear resources'
		)
	);
}
