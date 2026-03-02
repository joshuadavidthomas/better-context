import { Effect } from 'effect';

const INSTALL_COMMAND = [
	'bunx',
	'skills',
	'add',
	'davis7dotsh/better-context',
	'--skill',
	'btca-cli'
];

export const runSkillCommand = () =>
	Effect.tryPromise(async () => {
		const subprocess = Bun.spawn(INSTALL_COMMAND, {
			stdio: ['inherit', 'inherit', 'inherit']
		});

		const exitCode = await subprocess.exited;
		if (exitCode !== 0) {
			throw new Error(`skills install command exited with code ${exitCode}`);
		}
	});
