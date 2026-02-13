export const FS_RESOURCE_SYSTEM_NOTE =
	'This is a btca resource - a searchable knowledge source the agent can reference.';

export type BtcaFsResource = {
	readonly _tag: 'fs-based';
	readonly name: string;
	readonly fsName: string;
	readonly type: 'git' | 'local' | 'npm';
	readonly repoSubPaths: readonly string[];
	readonly specialAgentInstructions: string;
	readonly getAbsoluteDirectoryPath: () => Promise<string>;
	readonly cleanup?: () => Promise<void>;
};

export type BtcaGitResourceArgs = {
	readonly type: 'git';
	readonly name: string;
	readonly url: string;
	readonly branch: string;
	readonly repoSubPaths: readonly string[];
	readonly resourcesDirectoryPath: string;
	readonly specialAgentInstructions: string;
	readonly quiet: boolean;
	readonly ephemeral?: boolean;
	readonly localDirectoryKey?: string;
};

export type BtcaLocalResourceArgs = {
	readonly type: 'local';
	readonly name: string;
	readonly path: string;
	readonly specialAgentInstructions: string;
};

export type BtcaNpmResourceArgs = {
	readonly type: 'npm';
	readonly name: string;
	readonly package: string;
	readonly version?: string;
	readonly resourcesDirectoryPath: string;
	readonly specialAgentInstructions: string;
	readonly ephemeral?: boolean;
	readonly localDirectoryKey?: string;
};
