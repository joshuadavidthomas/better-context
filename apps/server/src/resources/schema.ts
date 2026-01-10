import { Schema } from 'effect';

const BaseResourceFields = {
	name: Schema.String,
	specialNotes: Schema.optional(Schema.String)
};

export const GitResourceSchema = Schema.Struct({
	...BaseResourceFields,
	type: Schema.Literal('git'),
	url: Schema.String,
	branch: Schema.String,
	searchPath: Schema.optional(Schema.String)
});

export const ResourceDefinitionSchema = GitResourceSchema;

export type GitResource = typeof GitResourceSchema.Type;
export type ResourceDefinition = typeof ResourceDefinitionSchema.Type;

export const isGitResource = (r: ResourceDefinition): r is GitResource => r.type === 'git';
