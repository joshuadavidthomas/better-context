import { Command } from 'commander';

const INSTALL_COMMAND =
	'npx skills add https://github.com/bmdavis419/better-context --skill btca-cli';

export const skillCommand = new Command('skill')
	.description('Print the skills.sh install command for the btca CLI skill')
	.action(() => {
		console.log('Run this command to install the btca CLI skill:');
		console.log(INSTALL_COMMAND);
	});
