// MongoDB duplicate-key error (a unique index refused the write).
export const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
