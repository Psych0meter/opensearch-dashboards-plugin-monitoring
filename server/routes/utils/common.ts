/**
 * Ensures all percentages are numbers and handled identically.
 * Returns a number rounded to 2 decimal places.
 */
export function calculatePercentage(used: number, total: number): number {
  if (!total || total <= 0) return 0;
  const percent = (used / total) * 100;
  return Math.round(percent * 100) / 100;
}
