import type { CharacterDto } from '@lorkarium/contracts';

/** One character of an event in its two versions, and who gets which: whole for the masters and
 *  `privilegedUserIds` (its player and its controllers), redacted for the rest of the table —
 *  unless `seenByTable` is false (its player is a spectator or left), then for the masters only. */
export type CharacterView = Readonly<{
  characterId: string;
  seenByTable: boolean;
  privilegedUserIds: readonly string[];
  privileged: CharacterDto;
  others: CharacterDto;
}>;

/** The characters one command changed, saved in one version of the table's characters. */
export type CharactersChange = Readonly<{
  campaignId: string;
  version: number;
  at: string;
  characters: readonly CharacterView[];
}>;

/** Sends a saved change of the characters to the live table, after the commit (spec §5.5): each
 *  viewer gets exactly one event per version — `character:changed` with what they see of it, or
 *  `character:removed` when none of it is for them — so their version never has a hole. */
export interface CharacterPublisherPort {
  charactersChanged(change: CharactersChange): void;
}
