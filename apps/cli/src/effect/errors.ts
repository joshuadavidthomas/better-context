import * as Data from 'effect/Data';

export class CliError extends Data.TaggedError('CliError')<{
	readonly message: string;
	readonly hint?: string;
	readonly cause?: unknown;
}> {}

export const formatCliError = (error: unknown) => {
	if (error && typeof error === 'object') {
		const details = error as { message?: string; hint?: string };
		const message =
			typeof details.message === 'string' && details.message.length > 0
				? details.message
				: String(error);
		if (typeof details.hint === 'string' && details.hint.length > 0) {
			return `${message}\n\nHint: ${details.hint}`;
		}
		return message;
	}
	return String(error);
};

export const formatCliCommandError = (error: unknown) => `Error: ${formatCliError(error)}`;
