import type { MemberCardPo } from '../../src/modules/member-cards/member-cards.po';
import { BIA_ID, VHARN_ID } from './campaigns-factories';

/** The card row of Bia on Vharn, empty unless overridden.
 *
 *  Example: `memberCardPo({ armorClass: 15 })` */
export function memberCardPo(overrides: Partial<MemberCardPo> = {}): MemberCardPo {
  return {
    campaignId: VHARN_ID,
    userId: BIA_ID,
    characterName: null,
    armorClass: null,
    difficultyClass: null,
    noteOne: null,
    noteTwo: null,
    anchorTokenId: null,
    updatedAt: new Date('2026-10-22T12:00:00Z'),
    ...overrides,
  };
}
