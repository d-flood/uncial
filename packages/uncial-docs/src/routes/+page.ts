import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

// The docs root has no content document of its own (content lives at
// /getting-started, /blocks, ...), so nothing prerendered `docs/index.html` and
// https://.../uncial/docs/ 404'd. Send the root to the first page — matching the
// header logo's link. `prerender` makes adapter-static write `index.html` as a
// redirect stub; `trailingSlash: 'always'` keeps it at `docs/index.html`.
export const prerender = true;
export const trailingSlash = 'always';

export const load = () => {
	redirect(307, `${base}/getting-started/`);
};
