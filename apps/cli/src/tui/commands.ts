import type { Command } from './types.ts';

export const COMMANDS: Command[] = [
	{
		name: 'connect',
		description: 'Configure provider and model',
		mode: 'connect'
	},
	{
		name: 'add',
		description: 'Add a new resource',
		mode: 'add-repo'
	},
	{
		name: 'clear',
		alias: 'new',
		description: 'Clear chat history',
		mode: 'clear'
	},
	{
		name: 'resume',
		description: 'Resume a previous thread',
		mode: 'resume'
	},
	{
		name: 'copy',
		description: 'Copy the latest user question and response',
		mode: 'copy'
	},
	{
		name: 'copy-all',
		description: 'Copy the full thread',
		mode: 'copy-all'
	}
];

export function filterCommands(query: string): Command[] {
	const lowerQuery = query.toLowerCase();
	return COMMANDS.filter(
		(cmd) =>
			cmd.name.toLowerCase().startsWith(lowerQuery) ||
			(cmd.alias?.toLowerCase().startsWith(lowerQuery) ?? false)
	);
}
