import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  CharacterBo,
  isSeenByTable,
  privilegedUserIdsOf,
  type CharacterSeat,
} from '../../../src/modules/characters/character.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  LYRA_CHARACTER_ID,
  LYRA_CHARACTER_PV_ID,
  characterBarPo,
} from '../../support/characters-factories';

type Role = 'master' | 'player' | 'spectator';

const LIMIT = 99_999;
const OTHER_BAR_ID = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';

const LYRA: CharacterSeat = {
  characterId: LYRA_CHARACTER_ID,
  userId: BIA_ID,
  holderRole: 'player',
  controllerIds: [BIA_ID],
};

function lyraFor(userId: string, role: Role, seat: Partial<CharacterSeat> = {}): CharacterBo {
  const access = new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
  return new CharacterBo(access, { ...LYRA, ...seat });
}

describe('CharacterBo.requireEdit', () => {
  it('Bia, its player, edits Lyra', () => {
    expect(() => lyraFor(BIA_ID, 'player').requireEdit('change')).not.toThrow();
  });

  it('Ana, the master, edits Lyra', () => {
    expect(() => lyraFor(ANA_ID, 'master').requireEdit('change')).not.toThrow();
  });

  it('Caio, listed in the control of Lyra, edits it', () => {
    const shared = { controllerIds: [BIA_ID, CAIO_ID] };
    expect(() => lyraFor(CAIO_ID, 'player', shared).requireEdit('change')).not.toThrow();
  });

  it('Caio, a player, editing Lyra of Bia is FORBIDDEN citing him, the action and the character', () => {
    expect(() => lyraFor(CAIO_ID, 'player').requireEdit('change')).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringMatching(
          new RegExp(`${CAIO_ID}.*change character ${LYRA_CHARACTER_ID}`),
        ),
      }),
    );
  });

  it('a character nobody plays (its player left) is edited by the master only', () => {
    const nobodys = { userId: null, holderRole: null, controllerIds: [] };
    expect(() => lyraFor(ANA_ID, 'master', nobodys).requireEdit('change')).not.toThrow();
    expect(() => lyraFor(BIA_ID, 'player', nobodys).requireEdit('change')).toThrow(
      expect.objectContaining({ code: 'CHARACTER_NOT_FOUND' }),
    );
  });

  it('Bia demoted to spectator is FORBIDDEN on her own Lyra (kept, inert)', () => {
    const stored = { holderRole: 'spectator' as const };
    expect(() => lyraFor(BIA_ID, 'spectator', stored).requireEdit('change')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('Caio, a player, on the character of a spectator gets CHARACTER_NOT_FOUND citing the table and the id', () => {
    const stored = { userId: DUDA_ID, holderRole: 'spectator' as const, controllerIds: [DUDA_ID] };
    expect(() => lyraFor(CAIO_ID, 'player', stored).requireEdit('change')).toThrow(
      expect.objectContaining({
        code: 'CHARACTER_NOT_FOUND',
        message: expect.stringContaining(
          `campaign ${VHARN_ID} has no character ${LYRA_CHARACTER_ID}`,
        ),
      }),
    );
  });
});

describe('CharacterBo.isSeen and audience', () => {
  it.each([
    ['Ana, the master', ANA_ID, 'master', 'privileged'],
    ['Bia, its player', BIA_ID, 'player', 'privileged'],
    ['Caio, another player', CAIO_ID, 'player', 'others'],
    ['Duda, a spectator', DUDA_ID, 'spectator', 'others'],
  ] as const)('%s sees Lyra as %s', (_who, userId, role, audience) => {
    const bo = lyraFor(userId, role);
    expect([bo.isSeen(), bo.audience()]).toEqual([true, audience]);
  });

  it('Duda, a spectator listed in the control, still sees Lyra redacted', () => {
    const bo = lyraFor(DUDA_ID, 'spectator', { controllerIds: [BIA_ID, DUDA_ID] });
    expect(bo.audience()).toBe('others');
  });

  it('a character of a spectator is seen by the master and by no player', () => {
    const stored = { holderRole: 'spectator' as const };
    expect(lyraFor(ANA_ID, 'master', stored).isSeen()).toBe(true);
    expect(lyraFor(CAIO_ID, 'player', stored).isSeen()).toBe(false);
  });

  it.each([
    ['player', true],
    ['master', true],
    ['spectator', false],
    [null, false],
  ] as const)('isSeenByTable with the holder %s is %s', (role, seen) => {
    expect(isSeenByTable(role)).toBe(seen);
  });

  it('privilegedUserIdsOf joins the player and the controllers without repeating', () => {
    const seat = { userId: BIA_ID, controllerIds: [BIA_ID, CAIO_ID] };
    expect(privilegedUserIdsOf(seat)).toEqual([BIA_ID, CAIO_ID]);
    expect(privilegedUserIdsOf({ userId: null, controllerIds: [] })).toEqual([]);
  });
});

describe('CharacterBo.adjustBar', () => {
  const bars = [characterBarPo()];

  it.each([
    ['add -7', { op: 'add', amount: -7 }, { current: 18, max: 30 }],
    ['set 40, over the max', { op: 'set', value: 40 }, { current: 40, max: 30 }],
    ['max 35', { op: 'max', value: 35 }, { current: 25, max: 35 }],
    ['add past the limit', { op: 'add', amount: 200_000 }, { current: LIMIT, max: 30 }],
  ] as const)(
    '%s on the PV of Lyra gives the values of the game-core rule',
    (_c, change, values) => {
      expect(
        lyraFor(BIA_ID, 'player').adjustBar(bars, LYRA_CHARACTER_PV_ID, change, LIMIT),
      ).toEqual(values);
    },
  );

  it('a bar that is not of Lyra is BAR_NOT_FOUND citing the bar and the character', () => {
    const adjust = (): unknown =>
      lyraFor(BIA_ID, 'player').adjustBar(bars, OTHER_BAR_ID, { op: 'add', amount: 1 }, LIMIT);
    expect(adjust).toThrow(
      expect.objectContaining({
        code: 'BAR_NOT_FOUND',
        message: `character ${LYRA_CHARACTER_ID} has no bar ${OTHER_BAR_ID}`,
      }),
    );
  });

  it('Caio adjusting the PV of Lyra is FORBIDDEN before the bar is looked at', () => {
    const adjust = (): unknown =>
      lyraFor(CAIO_ID, 'player').adjustBar(bars, OTHER_BAR_ID, { op: 'add', amount: 1 }, LIMIT);
    expect(adjust).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});

describe('CharacterBo.requireSeen and requireOwnSheet', () => {
  const SHEET_ID = '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d';
  const KAEL_ID = '8b7c6d5e-4f3a-4b2c-8d9e-0f1a2b3c4d5e';

  it('a stored Lyra (Bia demoted) is CHARACTER_NOT_FOUND to Caio and seen by Ana', () => {
    const stored = { holderRole: 'spectator' } as const;

    expect(() => lyraFor(CAIO_ID, 'player', stored).requireSeen()).toThrow(
      expect.objectContaining({
        code: 'CHARACTER_NOT_FOUND',
        message: expect.stringContaining(LYRA_CHARACTER_ID),
      }),
    );
    expect(() => lyraFor(ANA_ID, 'master', stored).requireSeen()).not.toThrow();
  });

  it("a sheet Lyra holds passes; Kael's, or nobody's, is SHEET_NOT_FOUND citing both", () => {
    const bo = lyraFor(BIA_ID, 'player');

    expect(() => bo.requireOwnSheet(SHEET_ID, LYRA_CHARACTER_ID)).not.toThrow();
    for (const holderId of [KAEL_ID, null]) {
      expect(() => bo.requireOwnSheet(SHEET_ID, holderId)).toThrow(
        expect.objectContaining({
          code: 'SHEET_NOT_FOUND',
          message: expect.stringContaining(
            `sheet ${SHEET_ID} held by character ${LYRA_CHARACTER_ID}`,
          ),
        }),
      );
    }
  });
});
