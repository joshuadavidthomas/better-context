import { Video } from '@remotion/media';
import { AbsoluteFill, staticFile } from 'remotion';

import type { ClipConfig } from '../types.ts';

type ClipSceneProps = {
	clip: ClipConfig;
};

export const ClipScene = ({ clip }: ClipSceneProps) => {
	return (
		<AbsoluteFill>
			<Video
				src={staticFile(clip.src)}
				trimBefore={clip.trimStartInFrames}
				trimAfter={clip.trimEndInFrames}
				style={{
					width: '100%',
					height: '100%',
					objectFit: 'cover'
				}}
				muted
			/>
		</AbsoluteFill>
	);
};
