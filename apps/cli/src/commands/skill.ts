const INSTALL_COMMAND = [
	'bunx',
	'skills',
	'add',
	'davis7dotsh/better-context',
	'--skill',
	'btca-cli'
];

export async function runSkillCommand() {
	const subprocess = Bun.spawn(INSTALL_COMMAND, {
		stdio: ['inherit', 'inherit', 'inherit']
	});

	const exitCode = await subprocess.exited;
	if (exitCode !== 0) {
		throw new Error(`skills install command exited with code ${exitCode}`);
	}
}
