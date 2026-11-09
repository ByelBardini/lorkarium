import type { TokenPatrolRepeatDto } from '@lorkarium/contracts';
import {
  PATROL_SPEED_MAX,
  PATROL_SPEED_MIN,
  PATROL_SPEED_STEP,
  patrolCycle,
  sameCell,
  type Cell,
} from '@lorkarium/game-core';
import { cellsText } from '@/lib/cells-text';

/** The shortcuts of the speed, in cells per second; any other speed marks none of them. */
export const SPEED_PRESETS = [
  { label: 'Devagar', speed: 0.5 },
  { label: 'Andando', speed: 1 },
  { label: 'Rápido', speed: 2 },
] as const;

/** One step of 0.25 slower (`-1`) or faster (`1`), kept between 0.25 and 4.
 *
 *  Example: `steppedSpeed(1, 1)` → `1.25`; `steppedSpeed(4, 1)` → `4` */
export function steppedSpeed(speed: number, direction: 1 | -1): number {
  const next = speed + direction * PATROL_SPEED_STEP;
  return Math.min(PATROL_SPEED_MAX, Math.max(PATROL_SPEED_MIN, next));
}

/** Whether a step that way still changes the speed (the − and + of "Personalizado").
 *
 *  Example: `canStepSpeed(0.25, -1)` → `false` */
export function canStepSpeed(speed: number, direction: 1 | -1): boolean {
  return steppedSpeed(speed, direction) !== speed;
}

/** The speed as read: "1 casa/s", "1,25 casas/s".
 *
 *  Example: `speedText(2)` → `'2 casas/s'` */
export function speedText(speed: number): string {
  return `${cellsText(speed)} ${speed === 1 ? 'casa' : 'casas'}/s`;
}

type SummaryInput = Readonly<{
  path: readonly Cell[];
  repeat: TokenPatrolRepeatDto;
  speed: number;
}>;

/** The line under the form: points, cells of one lap and how long a lap takes.
 *
 *  Example: `patrolSummaryOf({ path, repeat: 'loop', speed: 1 })` → `'3 pontos · 12 casas por volta · 12 s'` */
export function patrolSummaryOf({ path, repeat, speed }: SummaryInput): string {
  const points = `${path.length} ${path.length === 1 ? 'ponto' : 'pontos'}`;
  const [first] = path;
  if (!first || path.every((point) => sameCell(point, first))) return points;
  const cells = patrolCycle({ path, repeat }).length;
  return `${points} · ${cells} casas por volta · ${durationText(cells / speed)}`;
}

function durationText(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  if (rounded < 60) return `${cellsText(rounded)} s`;
  const minutes = Math.floor(rounded / 60);
  const rest = Math.round(rounded - minutes * 60);
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
