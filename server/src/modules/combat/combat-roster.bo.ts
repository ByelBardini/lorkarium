import type { RegroupTargetDto } from '@lorkarium/contracts';
import {
  initiative,
  nextAfterRemoval,
  orderCombatants,
  type TurnState,
} from '@lorkarium/game-core';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { TokenNotFoundError } from '../tokens/tokens.error';
import { entryIn, turnOf, type CombatantState, type CombatState } from './combat.bo';
import { CombatAlreadyActiveError, CombatNotActiveError } from './combat.error';

/** An entry to create: the master's name (or `null`), its tokens and the initiative typed while
 *  preparing (`null` = not rolled yet). */
export type NewEntry = Readonly<{
  name: string | null;
  tokenIds: readonly string[];
  initiative: number | null;
}>;

export type EntryLink = Readonly<{ combatantId: string; tokenIds: readonly string[] }>;

/** A token just pasted and the entry of the original it was copied from, if any. */
export type PastedToken = Readonly<{ tokenId: string; combatantId: string | undefined }>;

/** What a roster decision writes: entries to create (after all others), tokens to link and unlink,
 *  entries to take out, and the turn when it moves (`null` = it stays). */
export type RosterChange = Readonly<{
  create: readonly NewEntry[];
  link: readonly EntryLink[];
  unlink: readonly string[];
  remove: readonly string[];
  turn: TurnState | null;
}>;

const NOTHING = { create: [], link: [], unlink: [], remove: [] } as const;

/** Who is in the combat (spec §3.5): the master starts it, adds, splits, joins, renames and takes
 *  out entries. An entry that had tokens and is left without any leaves the order, passing the
 *  turn on; an entry born without tokens only leaves by "take out".
 *
 *  Example: `new CombatRosterBo(access, state).regroup([wolf], { kind: 'own' }, sceneTokenIds)` */
export class CombatRosterBo {
  constructor(
    private readonly access: CampaignAccessBo,
    private readonly combat: CombatState | null,
  ) {}

  start(entries: readonly NewEntry[], sceneTokenIds: readonly string[]): NewEntry[] {
    this.access.requireMaster('start the combat');
    if (this.combat) throw new CombatAlreadyActiveError(this.combat.id);
    this.requireOnScene(
      entries.flatMap(({ tokenIds }) => tokenIds),
      sceneTokenIds,
    );
    return entries.map(withValidInitiative);
  }

  /** The entries to create: a token already in the combat stays where it is, and an entry left
   *  without tokens by that is dropped (one sent without tokens is kept). */
  addCombatants(entries: readonly NewEntry[], sceneTokenIds: readonly string[]): NewEntry[] {
    this.access.requireMaster('add combatants');
    const combat = this.active();
    this.requireOnScene(
      entries.flatMap(({ tokenIds }) => tokenIds),
      sceneTokenIds,
    );
    return entries
      .map((entry) => ({
        entry: withValidInitiative(entry),
        kept: entry.tokenIds.filter((tokenId) => !holderOf(combat, tokenId)),
      }))
      .filter(({ entry, kept }) => entry.tokenIds.length === 0 || kept.length > 0)
      .map(({ entry, kept }) => ({ ...entry, tokenIds: kept }));
  }

  regroup(
    tokenIds: readonly string[],
    target: RegroupTargetDto,
    sceneTokenIds: readonly string[],
  ): RosterChange {
    this.access.requireMaster('regroup tokens');
    const combat = this.active();
    this.requireOnScene(tokenIds, sceneTokenIds);
    if (target.kind === 'entry') return moveInto(combat, tokenIds, target.combatantId);
    if (target.kind === 'own') return splitOff(combat, tokenIds);
    const leaving = tokenIds.filter((tokenId) => holderOf(combat, tokenId));
    return { ...withRemoved(combat, emptiedBy(combat, leaving)), unlink: leaving };
  }

  rename(combatantId: string, name: string): string {
    this.access.requireMaster('rename an entry');
    entryIn(this.active(), combatantId);
    return name;
  }

  removeCombatant(combatantId: string): TurnState {
    this.access.requireMaster('take a combatant out');
    const combat = this.active();
    entryIn(combat, combatantId);
    return nextAfterRemoval(orderOf(combat), combatantId, turnOf(combat));
  }

  /** What deleting the tokens does to the combat, or `null` with none: the entries they empty go,
   *  and the turn passes past all of them at once. The links go by the cascade. */
  leavingTokens(tokenIds: readonly string[]): RosterChange | null {
    if (!this.combat) return null;
    return withRemoved(this.combat, emptiedBy(this.combat, tokenIds));
  }

  /** The links of a paste: each copy joins the entry of its original when that entry is in this
   *  combat; a copy of an entry that left, or of another table, stays out without error. */
  pastedLinks(pasted: readonly PastedToken[]): EntryLink[] {
    const links = new Map<string, string[]>();
    for (const { tokenId, combatantId } of pasted) {
      if (!combatantId || !this.combat?.combatants.some(({ id }) => id === combatantId)) continue;
      links.set(combatantId, [...(links.get(combatantId) ?? []), tokenId]);
    }
    return [...links].map(([combatantId, tokenIds]) => ({ combatantId, tokenIds }));
  }

  private active(): CombatState {
    if (!this.combat) throw new CombatNotActiveError(this.access.campaignIdOf());
    return this.combat;
  }

  private requireOnScene(tokenIds: readonly string[], sceneTokenIds: readonly string[]): void {
    const stranger = tokenIds.find((id) => !sceneTokenIds.includes(id));
    if (stranger) throw new TokenNotFoundError(this.access.campaignIdOf(), stranger);
  }
}

function moveInto(
  combat: CombatState,
  tokenIds: readonly string[],
  combatantId: string,
): RosterChange {
  entryIn(combat, combatantId);
  const moving = tokenIds.filter((tokenId) => holderOf(combat, tokenId)?.id !== combatantId);
  const link = moving.length > 0 ? [{ combatantId, tokenIds: moving }] : [];
  return { ...withRemoved(combat, emptiedBy(combat, moving)), link };
}

// One at a time, so splitting every token of a group leaves the last one in the old entry.
function splitOff(combat: CombatState, tokenIds: readonly string[]): RosterChange {
  const remaining = new Map(combat.combatants.map(({ id, tokens }) => [id, tokens.length]));
  const create: NewEntry[] = [];
  const unlink: string[] = [];
  for (const tokenId of tokenIds) {
    const holder = holderOf(combat, tokenId);
    if (holder && remaining.get(holder.id) === 1) continue;
    create.push({ name: null, tokenIds: [tokenId], initiative: null });
    if (!holder) continue;
    unlink.push(tokenId);
    remaining.set(holder.id, (remaining.get(holder.id) ?? 1) - 1);
  }
  return { ...NOTHING, create, unlink, turn: null };
}

function withValidInitiative(entry: NewEntry): NewEntry {
  return { name: entry.name, tokenIds: entry.tokenIds, initiative: initiative(entry.initiative) };
}

function withRemoved(combat: CombatState, removed: readonly CombatantState[]): RosterChange {
  const remove = removed.map(({ id }) => id);
  return { ...NOTHING, remove, turn: turnWithout(combat, remove) };
}

// Removing them one at a time from the shrinking order passes the turn past all of them.
function turnWithout(combat: CombatState, removedIds: readonly string[]): TurnState | null {
  let order = orderOf(combat);
  let turn = turnOf(combat);
  for (const id of removedIds) {
    turn = nextAfterRemoval(order, id, turn);
    order = order.filter((candidate) => candidate !== id);
  }
  const before = turnOf(combat);
  return turn.round === before.round && turn.currentId === before.currentId ? null : turn;
}

function emptiedBy(combat: CombatState, tokenIds: readonly string[]): CombatantState[] {
  return combat.combatants.filter(
    ({ tokens }) => tokens.length > 0 && tokens.every(({ tokenId }) => tokenIds.includes(tokenId)),
  );
}

function holderOf(combat: CombatState, tokenId: string): CombatantState | undefined {
  return combat.combatants.find(({ tokens }) => tokens.some((t) => t.tokenId === tokenId));
}

function orderOf(combat: CombatState): string[] {
  return orderCombatants(combat.combatants).map(({ id }) => id);
}
