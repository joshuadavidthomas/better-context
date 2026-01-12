import { z } from 'zod';

export const GitResourceSchema = z.object({
	type: z.literal('git'),
	name: z.string().min(1),
	url: z.string().min(1),
	branch: z.string().min(1),
	searchPath: z.string().optional(),
	specialNotes: z.string().optional()
});

export const LocalResourceSchema = z.object({
	type: z.literal('local'),
	name: z.string().min(1),
	path: z.string().min(1),
	specialNotes: z.string().optional()
});

export const ResourceDefinitionSchema = z.discriminatedUnion('type', [
	GitResourceSchema,
	LocalResourceSchema
]);

export type GitResource = z.infer<typeof GitResourceSchema>;
export type LocalResource = z.infer<typeof LocalResourceSchema>;
export type ResourceDefinition = z.infer<typeof ResourceDefinitionSchema>;

export const isGitResource = (value: ResourceDefinition): value is GitResource =>
	value.type === 'git';

export const isLocalResource = (value: ResourceDefinition): value is LocalResource =>
	value.type === 'local';
