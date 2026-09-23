---
'uncial-cms': patch
---

Stop declaring `@sveltejs/kit` as an optional peer, which made `npm install uncial-cms` fail with ERESOLVE in non-SvelteKit hosts on an older Vite major (e.g. Astro 5).
