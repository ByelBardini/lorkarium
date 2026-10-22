import type { MemberCardChangesDto, MemberCardDto } from '@lorkarium/contracts';
import type { MemberCardChangesPo, MemberCardPo } from './member-cards.po';

/** A card row as the table sees it.
 *
 *  Example: `toMemberCardDto(await dao.save(campaignId, userId, changes))` */
export function toMemberCardDto(row: MemberCardPo): MemberCardDto {
  return {
    userId: row.userId,
    characterName: row.characterName,
    armorClass: row.armorClass,
    difficultyClass: row.difficultyClass,
    noteOne: row.noteOne,
    noteTwo: row.noteTwo,
  };
}

/** The keys the command carries, and only them: an absent key stays, `null` is written.
 *
 *  Example: `toMemberCardChangesPo({ armorClass: 15 })` → `{ armorClass: 15 }` */
export function toMemberCardChangesPo(changes: MemberCardChangesDto): MemberCardChangesPo {
  const present = Object.entries(changes).filter(([, value]) => value !== undefined);
  return Object.fromEntries(present) as MemberCardChangesPo;
}
