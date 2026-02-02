import type { CalculateMetadataFunction } from 'remotion';
import { Composition, Folder } from 'remotion';

import { LaunchVideo, launchVideoDefaultProps } from './compositions/LaunchVideo.tsx';
import type { LaunchVideoProps } from './types.ts';

const calculateMetadata: CalculateMetadataFunction<LaunchVideoProps> = ({ props }) => {
	const transitions = Math.max(props.clips.length, 0);
	const clipsTotal = props.clips.reduce((sum, clip) => sum + clip.durationInFrames, 0);
	const total =
		clipsTotal + props.featureDurationInFrames - transitions * props.transitionDurationInFrames;

	return {
		durationInFrames: Math.max(total, 1),
		props
	};
};

export const RemotionRoot = () => {
	return (
		<Folder name="Launch">
			<Composition
				id="btca-launch"
				component={LaunchVideo}
				durationInFrames={900}
				fps={30}
				width={1920}
				height={1080}
				defaultProps={
					{
						...launchVideoDefaultProps
					} satisfies LaunchVideoProps
				}
				calculateMetadata={calculateMetadata}
			/>
		</Folder>
	);
};
