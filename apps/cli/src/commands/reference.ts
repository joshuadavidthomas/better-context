import { Result } from 'better-result';
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const REFERENCES_DIR = 'references';
const EXCLUDE_PATTERN = 'references/';

const separators = ['/', '\\', ':'];

const trimTrailingSlashes = (value: string) => value.replace(/[\\/]+$/, '');

export const extractRepoName = (reference: string) => {
	const trimmed = reference.trim();
	if (!trimmed) throw new Error('Repository argument is required.');

	const normalized = trimTrailingSlashes(trimmed).replace(/\.git$/, '');
	const splitIndex = separators.reduce(
		(index, separator) => Math.max(index, normalized.lastIndexOf(separator)),
		-1
	);
	const repoName = (splitIndex >= 0 ? normalized.slice(splitIndex + 1) : normalized).trim();

	if (!repoName || repoName === '.' || repoName === '..') {
		throw new Error(`Could not determine repository name from reference: ${reference}`);
	}

	return repoName;
};

export const isPatternIgnored = (content: string, pattern: string) => {
	const lines = content.split('\n').map((line) => line.trim());
	const basePattern = pattern.replace(/\/$/, '');
	const patterns = [basePattern, `${basePattern}/`, `${basePattern}/*`];

	return lines.some((line) => {
		if (line.startsWith('#') || line === '') return false;
		return patterns.includes(line);
	});
};

const ensureReferencesExclude = async (cwd: string) => {
	const gitDir = path.join(cwd, '.git');
	if (!(await Bun.file(gitDir).exists())) return 'not-git-repo' as const;

	const excludePath = path.join(gitDir, 'info', 'exclude');
	await fs.mkdir(path.dirname(excludePath), { recursive: true });

	const file = Bun.file(excludePath);
	const existing = (await file.exists()) ? await file.text() : '';

	if (isPatternIgnored(existing, EXCLUDE_PATTERN)) return 'already-excluded' as const;

	const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
	await Bun.write(excludePath, `${existing}${prefix}${EXCLUDE_PATTERN}\n`);
	return 'added-exclude' as const;
};

const cloneReference = async (repo: string, destination: string) => {
	const subprocess = Bun.spawn(['git', 'clone', repo, destination], {
		stdio: ['inherit', 'inherit', 'inherit']
	});
	const exitCode = await subprocess.exited;
	if (exitCode !== 0) throw new Error(`git clone failed with exit code ${exitCode}`);
};

const printAgentSnippets = () => {
	console.log('\nCopy/paste into AGENTS.md (optional):');
	console.log('```md');
	console.log(
		'Use local repositories in `references/` as read-only reference context when relevant. Do not modify files under `references/`. Treat `references/` as supplemental context, not source of truth for this repo.'
	);
	console.log('```');

	console.log('\nCopy/paste into CLAUDE.md (optional):');
	console.log('```md');
	console.log(
		'Use local repositories in `references/` as read-only reference context when relevant. Do not modify files under `references/`. Treat `references/` as supplemental context, not source of truth for this repo.'
	);
	console.log('```');
};

export const referenceCommand = new Command('reference')
	.description('Clone a reference repository into ./references and keep it untracked locally')
	.argument('<repo>', 'Repository URL or git clone target')
	.action(async (repo: string) => {
		const result = await Result.tryPromise(async () => {
			const cwd = process.cwd();
			const repoName = extractRepoName(repo);
			const referencesDir = path.join(cwd, REFERENCES_DIR);
			const destination = path.join(referencesDir, repoName);

			if (await Bun.file(destination).exists()) {
				throw new Error(`Reference destination already exists: ${destination}`);
			}

			await fs.mkdir(referencesDir, { recursive: true });
			console.log(`Cloning ${repo} into ${destination}...`);
			await cloneReference(repo, destination);

			const excludeStatus = await ensureReferencesExclude(cwd);

			console.log(`\nReference cloned: ${destination}`);
			if (excludeStatus === 'added-exclude') {
				console.log(`Added '${EXCLUDE_PATTERN}' to .git/info/exclude`);
			} else if (excludeStatus === 'already-excluded') {
				console.log(`'${EXCLUDE_PATTERN}' is already present in .git/info/exclude`);
			} else {
				console.log(
					"Warning: current directory is not a git repository, so '.git/info/exclude' was not updated."
				);
			}

			printAgentSnippets();
		});

		if (Result.isError(result)) {
			console.error(
				`Error: ${result.error instanceof Error ? result.error.message : String(result.error)}`
			);
			process.exit(1);
		}
	});
