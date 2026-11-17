// The fixture's one site declaration. The GitHub half is inlined by the Vite
// config (see UNCIAL_FIXTURE_GITHUB there) so that one env var switches the
// fixture between a local-only site and a GitHub one.
import { base } from '$app/paths';
import { defineSite } from 'uncial-cms';

const sitePath = (value: unknown) => typeof value === 'string' && value.startsWith('/');
const link = {
	itemLabel: 'link',
	fields: {
		label: { default: '', required: true },
		href: { default: '/', required: true, validate: sitePath }
	}
};

export const site = defineSite(
	{
		contentDir: 'content',
		mediaDir: 'static/uploads',
		github: import.meta.env.UNCIAL_FIXTURE_GITHUB
			? { repo: 'uncial-fixture/site', branch: 'main' }
			: undefined,
		globals: {
			footer: {
				label: 'Site footer',
				meta: {
					note: { default: '' },
					columns: {
						default: [],
						list: {
							itemLabel: 'column',
							fields: {
								heading: { default: '', required: true },
								links: { default: [], list: link }
							}
						}
					}
				}
			}
		}
	},
	{ base, blocks: [], meta: { title: { default: 'Untitled page', required: true } } }
);
