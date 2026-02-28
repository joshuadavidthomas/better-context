import type { AgentEvent } from './loop.ts';

export type AgentResult = {
	answer: string;
	model: { provider: string; model: string };
	events: AgentEvent[];
};
