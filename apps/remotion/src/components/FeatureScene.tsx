import {
	AbsoluteFill,
	Easing,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig
} from 'remotion';

import { theme } from '../theme.ts';

type FeatureSceneProps = {
	title: string;
};

export const FeatureScene = ({ title }: FeatureSceneProps) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// Scale in animation with ease-out
	const scaleProgress = interpolate(frame, [0, fps * 0.5], [0, 1], {
		extrapolateRight: 'clamp',
		easing: Easing.out(Easing.cubic)
	});

	// Opacity fade in
	const opacity = interpolate(frame, [0, fps * 0.3], [0, 1], {
		extrapolateRight: 'clamp'
	});

	// Underline animation
	const underlineSpring = spring({
		frame: frame - 10,
		fps,
		config: { damping: 15, stiffness: 100 }
	});
	const underlineWidth = interpolate(underlineSpring, [0, 1], [0, 280]);

	return (
		<AbsoluteFill
			style={{
				background: '#f8fafc',
				fontFamily: 'SF Pro Display, Inter, system-ui, sans-serif',
				justifyContent: 'center',
				alignItems: 'center'
			}}
		>
			<div
				style={{
					transform: `scale(${scaleProgress})`,
					opacity,
					textAlign: 'center'
				}}
			>
				<div
					style={{
						fontSize: 100,
						fontWeight: 700,
						color: theme.text,
						letterSpacing: -2
					}}
				>
					{title}
				</div>

				{/* Underline accent */}
				<div
					style={{
						margin: '20px auto 0',
						width: underlineWidth,
						height: 5,
						borderRadius: 3,
						background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentAlt})`
					}}
				/>
			</div>
		</AbsoluteFill>
	);
};
