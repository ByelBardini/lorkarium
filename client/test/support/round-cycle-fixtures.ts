import type { RoundCycleDto, RoundCyclesChangedDto } from '@lorkarium/contracts';
import type { CharacterUpdate } from '@/services/table-session-api';
import { VHARN } from './campaigns-api-fake';
import { VHARN_SCENE } from './table-session-fixtures';

export const MOON_ID = '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d';
export const MOON_PHASE_IDS = [
  'a1000000-0000-4000-8000-000000000000',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
] as const;
const MOON_NAMES = ['Lua Nova', 'Crescente', 'Lua Cheia', 'Minguante'];
const EVENT_AT = '2026-11-25T21:00:00.000Z';

type MoonOverrides = Partial<RoundCycleDto> &
  Readonly<{ current?: number; chosen?: number | null; round?: number; sceneId?: string }>;

/** Fases da Lua as a viewer receives it: in combat on the VHARN grid (round 1, on Lua Nova)
 *  unless `combats` says otherwise; `current`/`chosen` are indexes of its four phases.
 *
 *  Example: `moonCycle({ current: 2, chosen: 0, canChoose: true })` */
export function moonCycle(overrides: MoonOverrides = {}): RoundCycleDto {
  const { current = 0, chosen = null, round = 1, sceneId = VHARN_SCENE.id, ...rest } = overrides;
  return {
    id: MOON_ID,
    name: 'Fases da Lua',
    announce: true,
    phases: MOON_PHASE_IDS.map((id, i) => ({
      id,
      name: MOON_NAMES[i] ?? '',
      icon: 'game-icons:cycle' as const,
      imageAssetId: null,
    })),
    canChoose: false,
    planLocked: false,
    config: null,
    combats: [
      {
        sceneId,
        round,
        currentPhaseId: MOON_PHASE_IDS[current] ?? null,
        chosenPhaseId: chosen === null ? null : (MOON_PHASE_IDS[chosen] ?? null),
      },
    ],
    ...rest,
  };
}

/** `cycle:listChanged` of VHARN at `version` carrying `cycles`, as the table stream gets it.
 *
 *  Example: `roundCyclesChangedAt(4, [moonCycle()])` */
export function roundCyclesChangedAt(version: number, cycles: RoundCycleDto[]): CharacterUpdate {
  const event: RoundCyclesChangedDto = { campaignId: VHARN.id, version, at: EVENT_AT, cycles };
  return { kind: 'roundCyclesChanged', event };
}
