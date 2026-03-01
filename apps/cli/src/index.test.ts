import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEffectCli } from './effect/cli-app.ts';

const CLI_DIR = fileURLToPath(new URL('..', import.meta.url));
const textFromProcessOutput = (value: Uint8Array | string | undefined) =>
	typeof value === 'string' ? value : value ? new TextDecoder().decode(value) : '';

const runCli = (argv: string[], timeout = 10_000, env?: Record<string, string>) => {
	const result = Bun.spawnSync({
		cmd: ['bun', 'run', 'src/index.ts', ...argv],
		cwd: CLI_DIR,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout,
		env: env ? { ...process.env, ...env } : process.env
	});

	return {
		exitCode: result.exitCode,
		output: `${textFromProcessOutput(result.stdout)}${textFromProcessOutput(result.stderr)}`
	};
};

const withTempHome = async <T>(run: (tempHome: string) => Promise<T>): Promise<T> => {
	const tempHome = mkdtempSync(path.join(tmpdir(), 'btca-cli-test-'));
	const originalHome = process.env.HOME;
	process.env.HOME = tempHome;
	try {
		return await run(tempHome);
	} finally {
		process.env.HOME = originalHome;
		rmSync(tempHome, { recursive: true, force: true });
	}
};

const createStubServer = () => {
	const requestPaths: string[] = [];
	const server = Bun.serve({
		port: 0,
		fetch: (request) => {
			const url = new URL(request.url);
			requestPaths.push(url.pathname);
			if (url.pathname === '/') {
				return Response.json({ ok: true });
			}
			if (url.pathname === '/resources') {
				return Response.json(
					{ error: 'stub resources error', tag: 'RequestError' },
					{ status: 500 }
				);
			}
			if (url.pathname === '/config') {
				return Response.json({ error: 'stub config error', tag: 'RequestError' }, { status: 500 });
			}
			if (url.pathname === '/providers') {
				return Response.json(
					{ error: 'stub providers error', tag: 'RequestError' },
					{ status: 500 }
				);
			}
			return Response.json({ error: 'stub not found', tag: 'RouteNotFound' }, { status: 404 });
		}
	});
	return {
		server,
		url: `http://127.0.0.1:${server.port}`,
		requestPaths
	};
};

describe('cli dispatch', () => {
	test('keeps subcommand help contextual for btca add', () => {
		const result = runCli(['add', '--help']);
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain('USAGE\n  btca add');
	});

	test('rejects unknown top-level commands with a suggestion', () => {
		const result = runCli(['remoev'], 750);
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("error: unknown command 'remoev'");
		expect(result.output).toContain("Did you mean 'remove'?");
	});

	test('rejects unknown top-level command with additional operands', () => {
		const result = runCli(['nonexistent', 'my-resource'], 750);
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("error: unknown command 'nonexistent'");
		expect(result.output).not.toContain('error: invalid command invocation');
	});

	test('continues interactive behavior for no top-level command', () => {
		const result = runCli([], 250);
		expect(result.exitCode).toBeNull();
		expect(result.output).not.toContain('error: unknown command');
	});

	test('returns non-zero for missing required ask flags', () => {
		const result = runCli(['ask']);
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain('Missing required flag: --question');
	});

	test('returns non-zero for invalid telemetry subcommands', () => {
		const result = runCli(['telemetry', 'foo']);
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain('Unknown subcommand "foo" for "btca telemetry"');
	});

	test('forwards subcommand --server to resources command', async () => {
		const stub = createStubServer();
		try {
			const exitCode = await withTempHome(() =>
				runEffectCli(['bun', 'src/index.ts', 'resources', '--server', stub.url], 'test')
			);
			expect(exitCode).toBe(1);
			expect(stub.requestPaths).toContain('/');
			expect(stub.requestPaths).toContain('/resources');
		} finally {
			stub.server.stop();
		}
	});

	test('forwards root --server to status command', async () => {
		const stub = createStubServer();
		try {
			const exitCode = await withTempHome(() =>
				runEffectCli(['bun', 'src/index.ts', '--server', stub.url, 'status'], 'test')
			);
			expect(exitCode).toBe(1);
			expect(stub.requestPaths).toContain('/');
			expect(stub.requestPaths).toContain('/config');
		} finally {
			stub.server.stop();
		}
	});
});
