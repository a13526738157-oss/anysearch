export const BOOKMARK_LIMITS = Object.freeze({
  maxSourceIdLength: 128,
  maxNodeIdLength: 128,
  maxTitleLength: 2_048,
  maxUrlLength: 8_192,
  maxFolderPathLength: 32,
  maxBookmarks: 50_000,
  minSequence: 1,
  maxSequence: Number.MAX_SAFE_INTEGER,
});

export const SOURCE_ID_PATTERN = new RegExp(`^[A-Za-z0-9._:-]{1,${BOOKMARK_LIMITS.maxSourceIdLength}}$`);
