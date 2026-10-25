import type { CombatDto, CombatTurnChangedDto, TokensDeletedDto } from '@lorkarium/contracts';

/** The combat as one audience may see it: an entry of only invisible tokens leaves the list, a
 *  mixed one loses those ids, one with no token stays; when the turn is on an entry that left,
 *  nobody is on the turn (`currentCombatantId: null`).
 *
 *  Example: `combatSeenBy(combat, new Set([wolfId]))` */
export function combatSeenBy(combat: CombatDto, invisible: ReadonlySet<string>): CombatDto;
export function combatSeenBy(
  combat: CombatDto | null,
  invisible: ReadonlySet<string>,
): CombatDto | null;
export function combatSeenBy(
  combat: CombatDto | null,
  invisible: ReadonlySet<string>,
): CombatDto | null {
  if (!combat || invisible.size === 0) return combat;
  const combatants = combat.combatants.flatMap((combatant) => {
    if (combatant.tokenIds.length === 0) return [combatant];
    const tokenIds = combatant.tokenIds.filter((tokenId) => !invisible.has(tokenId));
    return tokenIds.length === 0 ? [] : [{ ...combatant, tokenIds }];
  });
  const current = combatants.some(({ id }) => id === combat.currentCombatantId);
  return { ...combat, combatants, currentCombatantId: current ? combat.currentCombatantId : null };
}

/** A combat event (`combat:started`, `combat:updated`) with the combat cut; never empty: the
 *  round and the order of what is left are the audience's too.
 *
 *  Example: `cutsOf(event, veil, combatEventSeenBy)` */
export function combatEventSeenBy<Event extends Readonly<{ combat: CombatDto }>>(
  event: Event,
  invisible: ReadonlySet<string>,
): Event {
  return { ...event, combat: combatSeenBy(event.combat, invisible) };
}

/** `combat:turnChanged` with the combat cut and without the condition changes of invisible tokens.
 *
 *  Example: `cutsOf(event, veil, turnChangedSeenBy)` */
export function turnChangedSeenBy<Event extends CombatTurnChangedDto>(
  event: Event,
  invisible: ReadonlySet<string>,
): Event {
  const conditionChanges = event.conditionChanges.filter(({ tokenId }) => !invisible.has(tokenId));
  return { ...combatEventSeenBy(event, invisible), conditionChanges };
}

/** `token:deletedMany` without the invisible ids and with the combat cut; `null` only when no id is
 *  left and there is no combat to tell about.
 *
 *  Example: `cutsOf(event, veil, deletedSeenBy)` */
export function deletedSeenBy<Event extends TokensDeletedDto>(
  event: Event,
  invisible: ReadonlySet<string>,
): Event | null {
  const tokenIds = event.tokenIds.filter((tokenId) => !invisible.has(tokenId));
  if (tokenIds.length === 0 && event.combat === null) return null;
  return { ...event, tokenIds, combat: combatSeenBy(event.combat, invisible) };
}

/** `token:deleted` of a visible token with the combat cut (the deleted one is never invisible to
 *  who receives this: a hidden token leaves by `token:deletedMany`).
 *
 *  Example: `cutsOf(event, veil, deletedTokenSeenBy)` */
export function deletedTokenSeenBy<
  Event extends Readonly<{ tokenId: string; combat: CombatDto | null }>,
>(event: Event, invisible: ReadonlySet<string>): Event | null {
  if (invisible.has(event.tokenId)) return null;
  return { ...event, combat: combatSeenBy(event.combat, invisible) };
}
