export type ClipConfig = {
	id: string;
	src: string;
	label: string;
	headline: string;
	prompt?: string;
	durationInFrames: number;
	trimStartInFrames?: number;
	trimEndInFrames?: number;
};

export type LaunchVideoProps = {
	clips: ClipConfig[];
	features: string[];
	featureTitle: string;
	featureDurationInFrames: number;
	transitionDurationInFrames: number;
};
