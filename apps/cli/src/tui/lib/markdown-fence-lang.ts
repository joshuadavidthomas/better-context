const langAliases: Record<string, string> = {
	js: 'javascript',
	jsx: 'jsx',
	javascriptreact: 'jsx',
	ts: 'typescript',
	tsx: 'tsx',
	typescriptreact: 'tsx',
	svelte: 'svelte',
	sh: 'bash',
	shell: 'bash',
	zsh: 'bash',
	py: 'python',
	rs: 'rust',
	yml: 'yaml',
	md: 'markdown'
};

const normalizeLang = (lang: string) => langAliases[lang.toLowerCase()] ?? lang;

export const normalizeFenceLang = (markdown: string) =>
	markdown
		.split('\n')
		.map((line) => {
			const m = /^(\s*)(```+|~~~+)(\s*)([^\s]+)(.*)$/.exec(line);
			if (!m) return line;
			const indent = m[1] ?? '';
			const fence = m[2] ?? '';
			const ws = m[3] ?? '';
			const rawLang = m[4];
			const rest = m[5] ?? '';
			if (!rawLang) return line;
			return `${indent}${fence}${ws}${normalizeLang(rawLang)}${rest}`;
		})
		.join('\n');
