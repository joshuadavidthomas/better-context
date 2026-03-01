type NamedResource = { name: string };

const MENTION_REGEX = /(^|[^\w@])@(\S+)/g;
const TRAILING_MENTION_PUNCTUATION_REGEX = /[!?.,;:)\]}]+$/u;

const splitMentionToken = (token: string) => {
	const normalized = token.replace(TRAILING_MENTION_PUNCTUATION_REGEX, '');
	return {
		normalized,
		suffix: token.slice(normalized.length)
	};
};

export const extractMentionTokens = (input: string): string[] => {
	const mentions: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = MENTION_REGEX.exec(input)) !== null) {
		const token = match[2] ? splitMentionToken(match[2].trim()).normalized : '';
		if (token) mentions.push(token);
	}

	return [...new Set(mentions)];
};

export const stripMentionTokens = (input: string): string =>
	input
		.replace(MENTION_REGEX, (match, prefix, token) => {
			const { normalized, suffix } = splitMentionToken(token);
			return normalized ? `${prefix}${suffix}` : match;
		})
		.trim()
		.replace(/\s+/g, ' ');

export const stripResolvedMentionTokens = (
	input: string,
	resolvedReferences: readonly string[]
): string => {
	const resolvedSet = new Set(resolvedReferences.map((reference) => reference.toLowerCase()));
	return input
		.replace(MENTION_REGEX, (match, prefix, mention) => {
			const { normalized, suffix } = splitMentionToken(mention);
			return resolvedSet.has(normalized.toLowerCase()) ? `${prefix}${suffix}` : match;
		})
		.replace(/\s+/g, ' ')
		.trim();
};

export const resolveConfiguredResourceName = (
	input: string,
	available: readonly NamedResource[]
): string | null => {
	const target = input.toLowerCase();
	const direct = available.find((resource) => resource.name.toLowerCase() === target);
	if (direct) return direct.name;

	if (target.startsWith('@')) {
		const withoutAt = target.slice(1);
		const withoutAtMatch = available.find((resource) => resource.name.toLowerCase() === withoutAt);
		if (withoutAtMatch) return withoutAtMatch.name;
	}

	const withAt = `@${target}`;
	const withAtMatch = available.find((resource) => resource.name.toLowerCase() === withAt);
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

export const resolveResourceReference = (
	input: string,
	available: readonly NamedResource[]
): string | null => {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const token = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
	if (!token) return null;

	const configured = resolveConfiguredResourceName(token, available);
	if (configured) return configured;

	return isAnonymousResourceReference(token) ? token : null;
};
