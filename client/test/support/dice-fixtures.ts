import type { DiceRolledDto, DiceRolledSecretlyDto, SavedRollDto } from '@lorkarium/contracts';
import { VHARN } from './campaigns-api-fake';
import { BIA_AT_TABLE } from './table-session-fixtures';

export const BIA_ROLL_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

/** A d20 standing still: one pose (centre of the box, identity rotation). */
const RESTING_D20 = [0, 0, 0, 0, 0, 0, 32767];

/** Bia's public "Acerto" (`1d20+5` → 17 + 5 = 22), one d20 in 3D that settles after 2.4 s.
 *
 *  Example: `biaRolled({ rollId: OTHER_ID, settlesInMs: 800 })` */
export function biaRolled(overrides: Partial<DiceRolledDto> = {}): DiceRolledDto {
  return {
    campaignId: VHARN.id,
    rollId: BIA_ROLL_ID,
    rollerId: BIA_AT_TABLE.userId,
    visibility: 'public',
    label: 'Acerto',
    parts: [
      {
        label: 'Acerto',
        expression: '1d20+5',
        total: 22,
        dice: [{ sides: 20, value: 17, status: 'kept', model: [0] }],
      },
    ],
    total: 22,
    appearance: { color: BIA_AT_TABLE.color, textureId: null, numberColor: null },
    throw: {
      aspect: 1.78,
      frameMs: 1000 / 30,
      models: [{ kind: 'd20', startMs: 0, settleMs: 2400, frames: RESTING_D20 }],
    },
    settlesInMs: 2400,
    at: '2026-10-25T20:00:00.000Z',
    ...overrides,
  };
}

/** The notice of a masters-only roll of Bia, as a player who may not see it receives it. */
export function biaRolledSecretly(
  overrides: Partial<DiceRolledSecretlyDto> = {},
): DiceRolledSecretlyDto {
  return {
    campaignId: VHARN.id,
    rollId: BIA_ROLL_ID,
    rollerId: BIA_AT_TABLE.userId,
    settlesInMs: 800,
    at: '2026-10-25T20:00:00.000Z',
    ...overrides,
  };
}

/** The `n`-th roll id of a long history (`n` from 0 to 9999). */
export function rollIdOf(n: number): string {
  return `7a1b2c3d-4e5f-4a6b-8c7d-${String(n).padStart(12, '0')}`;
}

export const ACERTO_ID = 'a5c3e1f0-2b4d-4c6e-8f0a-1b3d5f7a9c2e';
export const BENCAO_ID = 'b6d4f2a1-3c5e-4d7f-9a1b-2c4e6a8b0d3f';

/** Bia's saved "Acerto" (`1d20+5`). */
export const ACERTO: SavedRollDto = {
  id: ACERTO_ID,
  name: 'Acerto',
  parts: [{ label: null, expression: '1d20+5' }],
};

/** Bia's saved "Bênção" (`1d4`). */
export const BENCAO: SavedRollDto = {
  id: BENCAO_ID,
  name: 'Bênção',
  parts: [{ label: null, expression: '1d4' }],
};
