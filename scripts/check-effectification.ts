type Check = {
	name: string;
	command: string[];
};

const checks: Check[] = [
	{
		name: 'no namespace exports in server/cli',
		command: ['rg', 'export\\s+namespace\\s+', 'apps/server/src', 'apps/cli/src']
	},
	{
		name: 'no process.exit in cli commands',
		command: ['rg', 'process\\.exit\\(', 'apps/cli/src/commands']
	},
	{
		name: 'no Effect.runPromise in tui tree',
		command: ['rg', 'Effect\\.runPromise', 'apps/cli/src/tui']
	}
];

const runCheck = (check: Check) => {
	const result = Bun.spawnSync(check.command, {
		stdout: 'pipe',
		stderr: 'pipe',
		cwd: process.cwd()
	});
	const stdout = Buffer.from(result.stdout).toString('utf8').trim();
	const stderr = Buffer.from(result.stderr).toString('utf8').trim();

	if (result.exitCode === 0) {
		return {
			ok: false,
			name: check.name,
			output: stdout || stderr || `Command matched: ${check.command.join(' ')}`
		};
	}

	if (result.exitCode === 1) {
		return { ok: true, name: check.name, output: '' };
	}

	return {
		ok: false,
		name: check.name,
		output: stderr || stdout || `Command failed: ${check.command.join(' ')}`
	};
};

const results = checks.map(runCheck);
const failed = results.filter((result) => !result.ok);

if (failed.length > 0) {
	console.error('effectification guard checks failed');
	for (const failure of failed) {
		console.error(`\n[${failure.name}]`);
		console.error(failure.output);
	}
	process.exitCode = 1;
} else {
	console.log('effectification guard checks passed');
}
