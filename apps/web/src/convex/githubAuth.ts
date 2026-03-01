'use node';

import { createClerkClient } from '@clerk/backend';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import { instances } from './apiHelpers';
import { WebAuthError, WebConfigMissingError, WebUnhandledError } from '../lib/result/errors';

const GITHUB_PROVIDER = 'github';
const REQUIRED_GITHUB_SCOPES = ['repo'] as const;

type InternalGithubConnections = {
	upsertForInstance: FunctionReference<
		'mutation',
		'internal',
		{
			instanceId: Id<'instances'>;
			clerkUserId: string;
			githubUserId?: number;
			githubLogin?: string;
			scopes: string[];
			status: 'connected' | 'missing_scope' | 'disconnected';
			connectedAt?: number;
		},
		Id<'githubConnections'>
	>;
};

const githubConnectionsInternal = internal as unknown as {
	githubConnections: InternalGithubConnections;
};

type GitHubUser = {
	id: number;
	login: string;
};

export type GitHubConnectionSnapshot =
	| {
			status: 'connected' | 'missing_scope';
			scopes: string[];
			githubUserId: number;
			githubLogin: string;
			connectedAt?: number;
			token: string;
	  }
	| {
			status: 'disconnected';
			scopes: string[];
			githubUserId?: undefined;
			githubLogin?: undefined;
			connectedAt?: undefined;
			token?: undefined;
	  };

const getClerkClient = () => {
	const secretKey = process.env.CLERK_SECRET_KEY;
	if (!secretKey) {
		throw new WebConfigMissingError({
			message: 'CLERK_SECRET_KEY environment variable is not set',
			config: 'CLERK_SECRET_KEY'
		});
	}
	return createClerkClient({ secretKey });
};

const normalizeScopes = (scopes: string[]) =>
	[...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();

const parseScopesHeader = (value: string | null) =>
	normalizeScopes(
		(value ?? '')
			.split(',')
			.map((scope) => scope.trim())
			.filter(Boolean)
	);

const hasRequiredGitHubScopes = (scopes: string[]) =>
	REQUIRED_GITHUB_SCOPES.every((scope) => scopes.includes(scope));

const getGitHubHeaders = (token: string) => ({
	Authorization: `Bearer ${token}`,
	Accept: 'application/vnd.github+json',
	'User-Agent': 'btca-web'
});

const fetchGitHubUser = async (token: string): Promise<{ user: GitHubUser; scopes: string[] }> => {
	const response = await fetch('https://api.github.com/user', {
		headers: getGitHubHeaders(token)
	});

	if (response.status === 401 || response.status === 403) {
		throw new WebAuthError({
			message: 'GitHub access token is no longer valid',
			code: 'UNAUTHORIZED'
		});
	}

	if (!response.ok) {
		throw new WebUnhandledError({
			message: `GitHub user lookup failed with status ${response.status}`
		});
	}

	const user = (await response.json()) as GitHubUser;
	const scopes = parseScopesHeader(response.headers.get('x-oauth-scopes'));
	return { user, scopes };
};

export const inspectGitHubConnectionForClerkUser = async (
	clerkUserId: string
): Promise<GitHubConnectionSnapshot> => {
	const clerkClient = getClerkClient();
	const oauthTokens = await clerkClient.users.getUserOauthAccessToken(clerkUserId, GITHUB_PROVIDER);
	const tokenData = oauthTokens.data[0];

	if (!tokenData?.token) {
		return {
			status: 'disconnected',
			scopes: []
		};
	}

	let userResult: { user: GitHubUser; scopes: string[] };
	try {
		userResult = await fetchGitHubUser(tokenData.token);
	} catch (error) {
		if (WebAuthError.is(error)) {
			return {
				status: 'disconnected',
				scopes: []
			};
		}
		throw error;
	}
	const { user, scopes: headerScopes } = userResult;
	const scopes = normalizeScopes([...(tokenData.scopes ?? []), ...headerScopes]);

	return {
		status: hasRequiredGitHubScopes(scopes) ? 'connected' : 'missing_scope',
		scopes,
		githubUserId: user.id,
		githubLogin: user.login,
		connectedAt: Date.now(),
		token: tokenData.token
	};
};

export const syncMyConnection = action({
	args: {},
	returns: v.object({
		status: v.union(v.literal('connected'), v.literal('missing_scope'), v.literal('disconnected')),
		scopes: v.array(v.string()),
		githubUserId: v.optional(v.number()),
		githubLogin: v.optional(v.string()),
		connectedAt: v.optional(v.number())
	}),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new WebAuthError({
				message: 'Authentication required',
				code: 'UNAUTHORIZED'
			});
		}

		const instance = await ctx.runQuery(instances.internalQueries.getByClerkIdInternal, {
			clerkId: identity.subject
		});
		if (!instance) {
			throw new WebUnhandledError({ message: 'Instance not found for authenticated user' });
		}

		const snapshot = await inspectGitHubConnectionForClerkUser(identity.subject);
		await ctx.runMutation(githubConnectionsInternal.githubConnections.upsertForInstance, {
			instanceId: instance._id,
			clerkUserId: identity.subject,
			githubUserId: snapshot.githubUserId,
			githubLogin: snapshot.githubLogin,
			scopes: snapshot.scopes,
			status: snapshot.status,
			connectedAt: snapshot.connectedAt
		});

		return {
			status: snapshot.status,
			scopes: snapshot.scopes,
			githubUserId: snapshot.githubUserId,
			githubLogin: snapshot.githubLogin,
			connectedAt: snapshot.connectedAt
		};
	}
});
