type NamedResource = { name: string };

const MENTION_REGEX = /(^|\s)@(\S+)/g;

export const extractMentionTokens = (input: string): string[] => {
	const mentions: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = MENTION_REGEX.exec(input)) !== null) {
		const token = match[2]?.trim();
		if (token) mentions.push(token);
	}

	return [...new Set(mentions)];
};

export const stripMentionTokens = (input: string): string =>
	input.replace(MENTION_REGEX, '$1').trim().replace(/\s+/g, ' ');

export const resolveConfiguredResourceName = (
	input: string,
	available: NamedResource[]
): string | null => {
	const target = input.toLowerCase();
	const direct = available.find((r) => r.name.toLowerCase() === target);
	if (direct) return direct.name;

	if (target.startsWith('@')) {
		const withoutAt = target.slice(1);
		const withoutAtMatch = available.find((r) => r.name.toLowerCase() === withoutAt);
		if (withoutAtMatch) return withoutAtMatch.name;
	}

	const withAt = `@${target}`;
	const withAtMatch = available.find((r) => r.name.toLowerCase() === withAt);
	return withAtMatch?.name ?? null;
};

export const isGitUrlReference = (input: string): boolean => {
	try {
		const parsed = new URL(input);
		return parsed.protocol === 'https:';
	} catch {
		return false;
	}
};

export const isNpmReference = (input: string): boolean => {
	const trimmed = input.trim();

	if (trimmed.startsWith('npm:')) {
		const spec = trimmed.slice(4);
		if (!spec || /\s/.test(spec)) return false;
		if (spec.startsWith('@')) {
			return /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:@[^\s/]+)?$/.test(spec);
		}
		return /^[a-z0-9][a-z0-9._-]*(?:@[^\s/]+)?$/.test(spec);
	}

	try {
		const parsed = new URL(trimmed);
		const hostname = parsed.hostname.toLowerCase();
		if (
			parsed.protocol !== 'https:' ||
			(hostname !== 'npmjs.com' && hostname !== 'www.npmjs.com')
		) {
			return false;
		}
		const segments = parsed.pathname.split('/').filter(Boolean);
		return segments[0] === 'package' && segments.length >= 2;
	} catch {
		return false;
	}
};

export const isAnonymousResourceReference = (input: string): boolean =>
	isGitUrlReference(input) || isNpmReference(input);

export const resolveMentionResourceReference = (
	input: string,
	available: NamedResource[]
): string | null => {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const token = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
	if (!token) return null;

	const configured = resolveConfiguredResourceName(token, available);
	if (configured) return configured;

	return isAnonymousResourceReference(token) ? token : null;
};
