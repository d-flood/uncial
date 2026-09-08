// The docs site object, resolved for the current build: the local checkout while
// developing, GitHub in the production build. Blocks and schema live in
// src/routes/site.ts, which re-exports the pieces the route factories take;
// keeping the object here leaves it importable from a block without a cycle back
// through the block registry.
import { defineSite } from 'uncial-cms';
import { siteOptions } from '../../site.options.js';

export { STATIC_DIR } from '../../site.options.js';

export const site = defineSite(siteOptions);
