import { describe, expect, it } from 'vitest';
import {
  RoundCycleRulesBo,
  type CycleViewer,
} from '../../../src/modules/round-cycles/round-cycle-rules.bo';

const LYRA = 'user-lyra';
const KAEL = 'user-kael';
const MIRA = 'user-mira';
const PLAYERS = new Set([LYRA, KAEL]);
const RULES = new RoundCycleRulesBo();

const master: CycleViewer = { kind: 'master' };
const lyra: CycleViewer = { kind: 'member', userId: LYRA };
const kael: CycleViewer = { kind: 'member', userId: KAEL };
const rest: CycleViewer = { kind: 'rest' };

type Visibility = 'everyone' | 'some' | 'masters';
const cycle = (
  visibility: Visibility,
  members = [{ userId: LYRA, canSee: true, canChoose: true }],
) => ({
  visibility,
  members,
});

describe('RoundCycleRulesBo.requireRoom', () => {
  it('19 cycles take one more, and the 21st is refused with ROUND_CYCLE_LIMIT citing the 20', () => {
    RULES.requireRoom('table-1', 19);
    expect(() => RULES.requireRoom('table-1', 20)).toThrow(
      expect.objectContaining({ code: 'ROUND_CYCLE_LIMIT', message: expect.stringMatching(/20/) }),
    );
  });
});

describe('RoundCycleRulesBo.membersOf', () => {
  it('seers see, choosers see and choose, and one in both is written once', () => {
    const members = RULES.membersOf({ seerIds: [LYRA, KAEL], chooserIds: [LYRA] }, PLAYERS);
    expect(members).toEqual([
      { userId: LYRA, canSee: true, canChoose: true },
      { userId: KAEL, canSee: true, canChoose: false },
    ]);
  });

  it('a chooser who is not among the seers still sees', () => {
    expect(RULES.membersOf({ seerIds: [], chooserIds: [KAEL] }, PLAYERS)).toEqual([
      { userId: KAEL, canSee: true, canChoose: true },
    ]);
  });

  it('someone who is not a player of the table is refused with ROUND_CYCLE_MEMBER_NOT_PLAYER citing them', () => {
    const work = () => RULES.membersOf({ seerIds: [MIRA], chooserIds: [] }, PLAYERS);
    expect(work).toThrow(
      expect.objectContaining({
        code: 'ROUND_CYCLE_MEMBER_NOT_PLAYER',
        message: expect.stringContaining(MIRA),
      }),
    );
  });
});

describe('RoundCycleRulesBo.sees', () => {
  it.each([
    ['everyone', rest, true],
    ['everyone', kael, true],
    ['some', lyra, true],
    ['some', kael, false],
    ['some', rest, false],
    ['masters', kael, false],
    ['masters', rest, false],
  ] as const)('a %s cycle seen by %o: %s', (visibility, viewer, expected) => {
    expect(RULES.sees(cycle(visibility), viewer)).toBe(expected);
  });

  it('the master sees every cycle', () => {
    expect(RULES.sees(cycle('masters', []), master)).toBe(true);
  });

  it('a chooser of a masters-only cycle sees it', () => {
    expect(RULES.sees(cycle('masters'), lyra)).toBe(true);
  });
});

describe('RoundCycleRulesBo.canChoose', () => {
  it('the master and the members who choose may, the rest may not', () => {
    const moon = cycle('everyone');
    expect([master, lyra, kael, rest].map((viewer) => RULES.canChoose(moon, viewer))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('a member who sees but does not choose is refused with FORBIDDEN citing who and the action', () => {
    const moon = cycle('some', [{ userId: KAEL, canSee: true, canChoose: false }]);
    expect(() =>
      RULES.requireChooser(
        moon,
        { campaignId: 'table-1', userId: KAEL, isMaster: false },
        'cycle-1',
      ),
    ).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN', message: expect.stringContaining(KAEL) }),
    );
  });
});
