/**
 * The GitHub Contents API rejects file payloads larger than ~1 MB. Reads,
 * document writes, and asset uploads all share this ceiling; there is no
 * git-blobs-API fallback (see the uncial-cms spec's media non-goal).
 */
export const MAX_CONTENT_BYTES = 1024 * 1024;
