// Chunk types for streaming responses
export interface TextChunk {
	type: 'text';
	id: string;
	text: string;
}

export interface ReasoningChunk {
	type: 'reasoning';
	id: string;
	text: string;
}

export interface ToolChunk {
	type: 'tool';
	id: string;
	toolName: string;
	state: 'pending' | 'running' | 'completed';
}

export interface FileChunk {
	type: 'file';
	id: string;
	filePath: string;
}

export type BtcaChunk = TextChunk | ReasoningChunk | ToolChunk | FileChunk;

export interface Repo {
	name: string;
	url: string;
	branch: string;
	specialNotes?: string | undefined;
	searchPath?: string | undefined;
}

export type CancelState = 'none' | 'pending';

export type InputState = (
	| {
			type: 'text' | 'command' | 'mention';
			content: string;
	  }
	| {
			type: 'pasted';
			content: string;
			lines: number;
	  }
)[];

export type AssistantContent =
	| { type: 'text'; content: string }
	| { type: 'chunks'; chunks: BtcaChunk[] };

export type Message =
	| {
			role: 'user';
			content: InputState;
	  }
	| {
			role: 'assistant';
			content: AssistantContent;
			canceled?: boolean; // true if this response was canceled
	  }
	| {
			role: 'system';
			content: string;
	  };

export type CommandMode = 'add-repo' | 'select-blessed-model' | 'clear';

export type ActiveWizard = 'none' | 'add-repo' | 'blessed-model';

export type WizardStep =
	| 'type'
	| 'name'
	| 'url'
	| 'branch'
	| 'searchPath'
	| 'path'
	| 'notes'
	| 'confirm'
	| null;

export interface Command {
	name: string;
	description: string;
	mode: CommandMode;
}
