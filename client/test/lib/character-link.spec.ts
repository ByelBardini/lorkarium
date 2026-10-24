import { describe, expect, it } from 'vitest';
import { cardLinkTargetsOf, cardOwnerOf } from '@/lib/character-link';
import { LYRA_ANCHOR_ID, castBoard, linkedLyra } from '../support/cast-fixtures';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  kael,
  memberCard,
} from '../support/table-session-fixtures';

const MEMBERS = [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE];
const BIA_CARD = memberCard({ anchorTokenId: LYRA_ANCHOR_ID });

describe('cardLinkTargetsOf', () => {
  it('lists the players only, with the character of whoever has one', () => {
    const cast = castBoard({ memberCards: [BIA_CARD] });
    expect(cardLinkTargetsOf(MEMBERS, cast)).toEqual([
      { memberId: BIA_AT_TABLE.userId, memberName: 'Bia', characterName: 'Lyra' },
      { memberId: CAIO_AT_TABLE.userId, memberName: 'Caio', characterName: null },
    ]);
  });

  it('the nickname on the card names the character', () => {
    const cast = castBoard({ memberCards: [{ ...BIA_CARD, characterName: 'Lyra Vandel' }] });
    expect(cardLinkTargetsOf(MEMBERS, cast)[0]?.characterName).toBe('Lyra Vandel');
  });

  it('with the cast still loading, nobody has a character yet', () => {
    expect(cardLinkTargetsOf(MEMBERS, null).map(({ characterName }) => characterName)).toEqual([
      null,
      null,
    ]);
  });
});

describe('cardOwnerOf', () => {
  it('names the player whose character the token is linked to', () => {
    expect(cardOwnerOf(linkedLyra(), [BIA_CARD], MEMBERS)).toBe('Bia');
  });

  it('a loose token, or a card not known yet, has no owner', () => {
    expect(cardOwnerOf(kael(), [BIA_CARD], MEMBERS)).toBeNull();
    expect(cardOwnerOf(linkedLyra(), [], MEMBERS)).toBeNull();
  });
});
