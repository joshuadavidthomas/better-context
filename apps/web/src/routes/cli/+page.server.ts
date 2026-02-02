import { redirect } from '@sveltejs/kit';

export const load = () => {
	throw redirect(301, 'https://docs.btca.dev/guides/quickstart');
};
