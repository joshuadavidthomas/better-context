import type { TaggedErrorOptions } from '../errors.ts';

export class ResourceError extends Error {
	readonly _tag = 'ResourceError';
	override readonly cause?: unknown;
	readonly hint?: string;

	constructor(args: TaggedErrorOptions) {
		super(args.message);
		this.cause = args.cause;
		this.hint = args.hint;
		if (args.stack) this.stack = args.stack;
	}
}

export const resourceNameToKey = (name: string): string => {
	return encodeURIComponent(name);
};
