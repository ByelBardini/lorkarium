export function hpPercentage(current: number, max: number): number {
  return max === 0 ? 0 : Math.round((current / max) * 100);
}
