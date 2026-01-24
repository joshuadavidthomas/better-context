import { McpServer } from 'tmcp';
import { HttpTransport } from '@tmcp/transport-http';
import { ZodJsonSchemaAdapter } from '@tmcp/adapter-zod';
import { ConvexHttpClient } from 'convex/browser';
import { z } from 'zod';
import { env } from '$env/dynamic/public';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { RequestHandler } from './$types';

interface AuthContext extends Record<string, unknown> {
	instanceId: Id<'instances'>;
	clerkId: string;
}

const getConvexClient = () => new ConvexHttpClient(env.PUBLIC_CONVEX_URL!);

const mcpServer = new McpServer<typeof askSchema, AuthContext>(
	{
		name: 'better-context',
		version: '1.0.0',
		description: 'Better Context MCP Server - Documentation and codebase context'
	},
	{
		adapter: new ZodJsonSchemaAdapter(),
		capabilities: {
			tools: { listChanged: false }
		}
	}
);

mcpServer.tool(
	{
		name: 'listResources',
		description:
			'List all available documentation resources. Call this first to see what resources you can query.'
	},
	async () => {
		const ctx = mcpServer.ctx.custom;
		if (!ctx) {
			return {
				content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Not authenticated' }) }],
				isError: true
			};
		}

		const convex = getConvexClient();
		const { custom } = await convex.query(api.resources.listAvailable, {
			instanceId: ctx.instanceId
		});

		return {
			content: [{ type: 'text' as const, text: JSON.stringify(custom, null, 2) }]
		};
	}
);

const askSchema = z.object({
	question: z.string().describe('The question to ask about the resources'),
	resources: z
		.array(z.string())
		.min(1)
		.describe('Array of resource names to query (from listResources). At least one required.')
});

mcpServer.tool(
	{
		name: 'ask',
		description:
			'Ask a question about specific documentation resources. You must call listResources first to get available resource names.',
		schema: askSchema
	},
	async ({ question, resources }) => {
		const ctx = mcpServer.ctx.custom;
		if (!ctx) {
			return {
				content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Not authenticated' }) }],
				isError: true
			};
		}

		const convex = getConvexClient();
		const result = await convex.action(api.mcp.ask, {
			instanceId: ctx.instanceId,
			question,
			resources
		});

		if (!result.ok) {
			return {
				content: [{ type: 'text' as const, text: JSON.stringify({ error: result.error }) }],
				isError: true
			};
		}

		return {
			content: [{ type: 'text' as const, text: result.text }]
		};
	}
);

const transport = new HttpTransport<AuthContext>(mcpServer, { path: '/api/mcp' });

async function validateApiKey(
	request: Request
): Promise<
	{ valid: false; error: string } | { valid: true; context: AuthContext; keyId: Id<'apiKeys'> }
> {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		return { valid: false, error: 'Missing or invalid Authorization header' };
	}

	const apiKey = authHeader.slice(7);
	if (!apiKey) {
		return { valid: false, error: 'Missing API key' };
	}

	const convex = getConvexClient();
	const validation = await convex.query(api.apiKeys.validate, { apiKey });

	if (!validation.valid) {
		return { valid: false, error: validation.error };
	}

	return {
		valid: true,
		keyId: validation.keyId,
		context: {
			instanceId: validation.userId,
			clerkId: validation.clerkId
		}
	};
}

export const POST: RequestHandler = async ({ request }) => {
	const auth = await validateApiKey(request);
	if (!auth.valid) {
		return new Response(JSON.stringify({ error: auth.error }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const convex = getConvexClient();
	await convex.mutation(api.apiKeys.touchLastUsed, { keyId: auth.keyId });

	const response = await transport.respond(request, auth.context);
	return response ?? new Response('Not Found', { status: 404 });
};

export const GET: RequestHandler = async ({ request }) => {
	const auth = await validateApiKey(request);
	if (!auth.valid) {
		return new Response(JSON.stringify({ error: auth.error }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const response = await transport.respond(request, auth.context);
	return response ?? new Response('Not Found', { status: 404 });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const auth = await validateApiKey(request);
	if (!auth.valid) {
		return new Response(JSON.stringify({ error: auth.error }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const response = await transport.respond(request, auth.context);
	return response ?? new Response('Not Found', { status: 404 });
};
