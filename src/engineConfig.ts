export const DEFAULT_MAX_THOUGHTS = 500;
export const MAX_THOUGHTS_CAP = 10000;
export const MAX_MEMORY_BYTES = 100 * 1024 * 1024;
export const ESTIMATED_THOUGHT_OVERHEAD_BYTES = 200;
export const COMPACT_THRESHOLD = 1024;
export const COMPACT_RATIO = 0.5;

export function normalizeInt(
  value: number | undefined,
  fallback: number,
  options: { min: number; max: number }
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(options.min, Math.min(options.max, Math.trunc(value)));
}
