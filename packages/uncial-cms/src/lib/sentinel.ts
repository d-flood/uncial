/**
 * Embedded verbatim in every bundle that includes the editor runtime (see
 * mount.ts). The clean-pages build assertion greps content-page HTML and its
 * JS chunks for this string to prove production pages ship zero CMS code.
 */
export const UNCIAL_CMS_RUNTIME_SENTINEL = 'uncial-cms-runtime-sentinel-v1';
