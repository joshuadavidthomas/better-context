import { useMemo } from 'react';
import { CodeRenderable, getTreeSitterClient } from '@opentui/core';

import { normalizeFenceLang } from '../lib/markdown-fence-lang.ts';
import { colors } from '../theme.ts';
import { syntaxStyle } from '../syntax-theme.ts';

export interface MarkdownTextProps {
	content: string;
	streaming?: boolean;
}

export const MarkdownText = (props: MarkdownTextProps) => {
	const treeSitterClient = useMemo(() => getTreeSitterClient(), []);
	const content = useMemo(() => normalizeFenceLang(props.content), [props.content]);

	return (
		<markdown
			content={content}
			syntaxStyle={syntaxStyle}
			treeSitterClient={treeSitterClient}
			conceal
			streaming={Boolean(props.streaming)}
			renderNode={(token, context) => {
				if (token.type !== 'code') return null;

				const r = context.defaultRender();
				if (!r) return r;

				if (r instanceof CodeRenderable) {
					r.bg = colors.bg;
					r.paddingLeft = 1;
					r.paddingRight = 1;
					r.wrapMode = 'none';
					r.truncate = false;
					r.streaming = Boolean(props.streaming);
				}

				return r;
			}}
		/>
	);
};
