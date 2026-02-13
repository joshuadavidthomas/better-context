export { ResourceError } from './helpers.ts';
export { Resources } from './service.ts';
export {
	GitResourceSchema,
	LocalResourceSchema,
	NpmResourceSchema,
	ResourceDefinitionSchema,
	isGitResource,
	isLocalResource,
	isNpmResource,
	type GitResource,
	type LocalResource,
	type NpmResource,
	type ResourceDefinition
} from './schema.ts';
export {
	FS_RESOURCE_SYSTEM_NOTE,
	type BtcaFsResource,
	type BtcaGitResourceArgs,
	type BtcaNpmResourceArgs
} from './types.ts';
