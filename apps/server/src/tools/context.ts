export type ToolMode = 'fs' | 'virtual';

export type ToolContext = {
	basePath: string;
	mode?: ToolMode;
};
