import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

import { ClipScene } from '../components/ClipScene.tsx';
import type { ClipConfig, LaunchVideoProps } from '../types.ts';

const clip = (overrides: Partial<ClipConfig> & Pick<ClipConfig, 'id'>): ClipConfig => {
	const base = {
		id: overrides.id,
		src: overrides.src ?? 'launch/tui.mov',
		label: overrides.label ?? 'TUI',
		headline: overrides.headline ?? '',
		durationInFrames: overrides.durationInFrames ?? 120
	} satisfies ClipConfig;

	return {
		...base,
		...(overrides.prompt == null ? {} : { prompt: overrides.prompt }),
		...(overrides.trimStartInFrames == null
			? {}
			: { trimStartInFrames: overrides.trimStartInFrames }),
		...(overrides.trimEndInFrames == null ? {} : { trimEndInFrames: overrides.trimEndInFrames })
	};
};

export const launchVideoDefaultProps: LaunchVideoProps = {
	clips: [
		// Shot 1: TUI - typing in a question
		clip({
			id: 'tui-ask',
			src: 'launch/tui.mov',
			headline: '',
			durationInFrames: 150, // 5 seconds at 30fps
			trimStartInFrames: 18 * 30, // Start at 18s
			trimEndInFrames: 23 * 30 // End at 23s
		})
	],
	features: ['Web app', 'MCP server', 'TUI', 'CLI'],
	featureTitle: 'btca.dev',
	featureDurationInFrames: 90,
	transitionDurationInFrames: 15
};

export const LaunchVideo = ({ clips }: LaunchVideoProps) => {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	const c0 = clips[0]!;

	// Very subtle drift down and to the left
	const translateX = interpolate(frame, [0, durationInFrames], [0, -30], {
		extrapolateRight: 'clamp'
	});
	const translateY = interpolate(frame, [0, durationInFrames], [0, 20], {
		extrapolateRight: 'clamp'
	});

	return (
		<AbsoluteFill style={{ background: '#ffffff' }}>
			{/* 3D perspective container */}
			<AbsoluteFill
				style={{
					perspective: 1200,
					perspectiveOrigin: '30% 90%'
				}}
			>
				<div
					style={{
						position: 'absolute',
						left: '5%',
						bottom: '5%',
						width: '110%',
						height: '110%',
						transform: `translateX(${translateX}px) translateY(${translateY}px) rotateX(8deg) rotateY(-3deg)`,
						transformOrigin: '30% 100%',
						boxShadow:
							'0 50px 100px rgba(0, 0, 0, 0.25), 0 30px 60px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.1)'
					}}
				>
					<ClipScene clip={c0} />
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
