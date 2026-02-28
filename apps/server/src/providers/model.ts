/**
 * Model Instantiation
 * Creates AI SDK models with authentication from OpenCode
 */
import type { LanguageModel } from 'ai';

import { Auth } from './auth.ts';
import {
	getProviderFactory,
	isProviderSupported,
	normalizeProviderId,
	type ProviderOptions
} from './registry.ts';

export class ProviderNotFoundError extends Error {
	readonly _tag = 'ProviderNotFoundError';
	readonly providerId: string;
	readonly hint: string;

	constructor(providerId: string) {
		super(`Provider "${providerId}" is not supported`);
		this.providerId = providerId;
		this.hint =
			'Open an issue to request this provider: https://github.com/davis7dotsh/better-context/issues.';
	}
}

export class ProviderNotAuthenticatedError extends Error {
	readonly _tag = 'ProviderNotAuthenticatedError';
	readonly providerId: string;
	readonly hint: string;

	constructor(providerId: string) {
		super(`Provider "${providerId}" is not authenticated.`);
		this.providerId = providerId;
		this.hint = Auth.getProviderAuthHint(providerId);
	}
}

export class ProviderAuthTypeError extends Error {
	readonly _tag = 'ProviderAuthTypeError';
	readonly providerId: string;
	readonly authType: string;
	readonly hint: string;

	constructor(args: { providerId: string; authType: string }) {
		super(`Provider "${args.providerId}" does not support "${args.authType}" auth.`);
		this.providerId = args.providerId;
		this.authType = args.authType;
		this.hint = Auth.getProviderAuthHint(args.providerId);
	}
}

export class ProviderOptionsError extends Error {
	readonly _tag = 'ProviderOptionsError';
	readonly providerId: string;
	readonly hint: string;

	constructor(args: { providerId: string; message: string; hint: string }) {
		super(args.message);
		this.providerId = args.providerId;
		this.hint = args.hint;
	}
}

export type ModelOptions = {
	providerOptions?: Partial<ProviderOptions>;
	skipAuth?: boolean;
	allowMissingAuth?: boolean;
};

export const getModel = async (
	providerId: string,
	modelId: string,
	options: ModelOptions = {}
): Promise<LanguageModel> => {
	const normalizedProviderId = normalizeProviderId(providerId);

	if (!isProviderSupported(normalizedProviderId)) {
		throw new ProviderNotFoundError(providerId);
	}

	const factory = getProviderFactory(normalizedProviderId);
	if (!factory) {
		throw new ProviderNotFoundError(providerId);
	}

	let apiKey: string | undefined;
	let accountId: string | undefined;

	if (!options.skipAuth) {
		const status = await Auth.getAuthStatus(normalizedProviderId);
		if (status.status === 'missing') {
			if (!options.allowMissingAuth) {
				throw new ProviderNotAuthenticatedError(providerId);
			}
		}
		if (status.status === 'invalid') {
			throw new ProviderAuthTypeError({ providerId, authType: status.authType });
		}
		if (status.status === 'ok') {
			apiKey = status.apiKey;
			accountId = status.accountId;
		}
	}

	const providerOptions: ProviderOptions = {
		...options.providerOptions,
		...(accountId ? { accountId } : {})
	};

	if (apiKey) {
		providerOptions.apiKey = apiKey;
	}

	if (normalizedProviderId === 'openai-compat') {
		const baseURL = providerOptions.baseURL?.trim();
		const name = providerOptions.name?.trim();
		if (!baseURL || !name) {
			throw new ProviderOptionsError({
				providerId: normalizedProviderId,
				message: 'openai-compat requires baseURL and name',
				hint: 'Run "btca connect -p openai-compat" to configure baseURL and name.'
			});
		}
		providerOptions.baseURL = baseURL;
		providerOptions.name = name;
	}

	const provider = factory(providerOptions);
	const model = provider(modelId);
	return model as LanguageModel;
};

export const canUseModel = async (providerId: string): Promise<boolean> => {
	const normalizedProviderId = normalizeProviderId(providerId);

	if (!isProviderSupported(normalizedProviderId)) {
		return false;
	}

	return Auth.isAuthenticated(normalizedProviderId);
};

export const getAvailableProviders = async (): Promise<string[]> => {
	const authenticatedProviders = await Auth.getAuthenticatedProviders();
	return authenticatedProviders.filter((provider) => isProviderSupported(provider));
};

export const Model = {
	getModel,
	canUseModel,
	getAvailableProviders
} as const;
