import { describe, expect, it } from 'vitest';
import type { MainTokenDto, MemberCardDto, TokenDto } from '@lorkarium/contracts';
import {
  isListedIn,
  mainTokenIdOf,
  mainTokenIdOfMember,
  mainTokenPlayersOf,
} from '@/lib/main-token';
import { ANA } from '../support/auth-api-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  kael,
  lyra,
  memberCard,
} from '../support/table-session-fixtures';
import { LYRA_ANCHOR_ID } from '../support/cast-fixtures';

const BIA = BIA_AT_TABLE.userId;
const CHEST_ID = '0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b';

function boardOf(
  tokens: TokenDto[],
  mainTokens: MainTokenDto[] = [],
  userId = BIA,
  memberCards: MemberCardDto[] = [],
) {
  return { viewer: { userId, role: 'player' as const }, tokens, mainTokens, memberCards };
}

describe('mainTokenIdOf', () => {
  it('Bia with no choice, listed on Lyra (the oldest) and on Kael → Lyra', () => {
    expect(mainTokenIdOf(boardOf([lyra(), kael()]))).toBe(LYRA_ID);
  });

  it('Bia who chose Kael → Kael', () => {
    const chosen = [{ userId: BIA, tokenId: KAEL_ID }];
    expect(mainTokenIdOf(boardOf([lyra(), kael()], chosen))).toBe(KAEL_ID);
  });

  it('the choice of Caio does not count for Bia', () => {
    const chosen = [{ userId: CAIO_AT_TABLE.userId, tokenId: KAEL_ID }];
    expect(mainTokenIdOf(boardOf([lyra(), kael()], chosen))).toBe(LYRA_ID);
  });

  it('a choice on a token that no longer lists Bia falls back to the automatic one', () => {
    const chosen = [{ userId: BIA, tokenId: KAEL_ID }];
    const tokens = [lyra(), kael({ controllerIds: [CAIO_AT_TABLE.userId] })];
    expect(mainTokenIdOf(boardOf(tokens, chosen))).toBe(LYRA_ID);
  });

  it('a choice on a token that is not on the board falls back to the automatic one', () => {
    const chosen = [{ userId: BIA, tokenId: CHEST_ID }];
    expect(mainTokenIdOf(boardOf([lyra(), kael()], chosen))).toBe(LYRA_ID);
  });

  it('the oldest token listing Bia on the Objects layer is skipped for the next on Tokens', () => {
    const chest = lyra({ id: CHEST_ID, name: 'Baú', layer: 'objects' });
    expect(mainTokenIdOf(boardOf([chest, lyra(), kael()]))).toBe(LYRA_ID);
  });

  it('an explicit choice of a token on the Objects layer that lists Bia holds', () => {
    const chest = lyra({ id: CHEST_ID, name: 'Baú', layer: 'objects' });
    const chosen = [{ userId: BIA, tokenId: CHEST_ID }];
    expect(mainTokenIdOf(boardOf([lyra(), chest], chosen))).toBe(CHEST_ID);
  });

  it('the master, who can control everything but is listed nowhere, has none', () => {
    const board = {
      ...boardOf([lyra(), kael()], [], ANA.id),
      viewer: { userId: ANA.id, role: 'master' as const },
    };
    expect(mainTokenIdOf(board)).toBeNull();
  });

  it('no token listing Bia → none', () => {
    const tokens = [lyra({ controllerIds: [] }), kael({ controllerIds: [CAIO_AT_TABLE.userId] })];
    expect(mainTokenIdOf(boardOf(tokens))).toBeNull();
  });
});

describe('isListedIn', () => {
  it('Bia is listed in the control of Lyra, the master (who can control it) is not', () => {
    expect(isListedIn(lyra(), BIA)).toBe(true);
    expect(isListedIn(lyra({ canControl: true }), ANA.id)).toBe(false);
  });
});

describe('mainTokenPlayersOf', () => {
  const members = [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE];
  const shared = lyra({ controllerIds: [BIA, CAIO_AT_TABLE.userId, ANA.id] });

  function asAna(tokens: TokenDto[], mainTokens: MainTokenDto[] = []) {
    return {
      viewer: { userId: ANA.id, role: 'master' as const },
      tokens,
      mainTokens,
      memberCards: [],
    };
  }

  it('lists the players in the control of Lyra but the viewer, by name, marking whose main it is', () => {
    const chosen = [{ userId: CAIO_AT_TABLE.userId, tokenId: KAEL_ID }];
    const caioKael = kael({ controllerIds: [CAIO_AT_TABLE.userId] });
    const players = mainTokenPlayersOf(asAna([shared, caioKael], chosen), LYRA_ID, members);

    expect(players).toEqual([
      { userId: BIA, name: 'Bia', isMain: true },
      { userId: CAIO_AT_TABLE.userId, name: 'Caio', isMain: false },
    ]);
  });

  it('a token nobody is listed on, or that is not on the board, has no player', () => {
    expect(mainTokenPlayersOf(asAna([lyra({ controllerIds: [] })]), LYRA_ID, members)).toEqual([]);
    expect(mainTokenPlayersOf(asAna([]), LYRA_ID, members)).toEqual([]);
  });

  it('someone listed who is no longer a member is left out', () => {
    const gone = lyra({ controllerIds: [CHEST_ID] });
    expect(mainTokenPlayersOf(asAna([gone]), LYRA_ID, members)).toEqual([]);
  });
});

describe('mainTokenIdOfMember', () => {
  it('finds the Kael of Caio with Bia as the viewer', () => {
    const caioKael = kael({ controllerIds: [CAIO_AT_TABLE.userId] });

    expect(mainTokenIdOfMember(boardOf([lyra(), caioKael]), CAIO_AT_TABLE.userId)).toBe(KAEL_ID);
  });

  it('a member listed on no token has none', () => {
    expect(mainTokenIdOfMember(boardOf([lyra()]), CAIO_AT_TABLE.userId)).toBeNull();
  });
});

describe('mainTokenIdOfMember, by the character', () => {
  const biaCard = memberCard({ anchorTokenId: LYRA_ANCHOR_ID });
  // Kael is the oldest token listing Bia; the linked one is newer and on another layer.
  const linked = lyra({ id: CHEST_ID, anchorTokenId: LYRA_ANCHOR_ID, layer: 'objects' });

  it("without a choice in the grid, the token linked to the person's anchor wins over the oldest", () => {
    const board = boardOf([kael(), linked], [], BIA, [biaCard]);
    expect(mainTokenIdOfMember(board, BIA)).toBe(CHEST_ID);
  });

  it("the grid's explicit choice still wins (the werewolf of this scene)", () => {
    const chosen = [{ userId: BIA, tokenId: KAEL_ID }];
    expect(mainTokenIdOfMember(boardOf([kael(), linked], chosen, BIA, [biaCard]), BIA)).toBe(
      KAEL_ID,
    );
  });

  it('with no token of the character in the grid, the automatic one as before', () => {
    expect(mainTokenIdOfMember(boardOf([kael()], [], BIA, [biaCard]), BIA)).toBe(KAEL_ID);
  });

  it("another person's character does not count", () => {
    const caioCard = memberCard({ userId: CAIO_AT_TABLE.userId, anchorTokenId: LYRA_ANCHOR_ID });
    expect(mainTokenIdOfMember(boardOf([kael(), linked], [], BIA, [caioCard]), BIA)).toBe(KAEL_ID);
  });
});
