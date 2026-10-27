import { UsageStat } from '../../../common/types';

/**
 * Returns `value` when it is a finite, non-negative number, otherwise
 * `fallback`. OpenSearch reports -1 for metrics it cannot determine (CPU
 * percent on some platforms, filesystem or swap totals, unknown translog
 * totals); those must not reach the UI as negative sizes or percentages.
 */
export function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Returns `value` when it is a finite, non-negative number, otherwise `null`.
 */
export function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Returns `value` when it is a non-empty string, otherwise `null`.
 */
export function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Ensures all percentages are numbers and handled identically.
 * Returns a number rounded to 2 decimal places; 0 when the total is unknown.
 */
export function calculatePercentage(used: number, total: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  const percent = (used / total) * 100;
  return Math.round(percent * 100) / 100;
}

/**
 * Builds a usage triple from possibly-missing upstream values.
 */
export function toUsage(used: unknown, total: unknown): UsageStat {
  const safeUsed = toNumber(used);
  const safeTotal = toNumber(total);
  return {
    total: safeTotal,
    used: safeUsed,
    percent: calculatePercentage(safeUsed, safeTotal),
  };
}

/**
 * Builds a usage triple from a total and a free value.
 */
export function toUsageFromFree(total: unknown, free: unknown): UsageStat {
  const safeTotal = toNumber(total);
  const safeFree = toNumber(free, safeTotal);
  return toUsage(Math.max(0, safeTotal - safeFree), safeTotal);
}
