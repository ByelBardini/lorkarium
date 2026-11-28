import {
  ROUND_CYCLE_PHASES_MAX,
  ROUND_CYCLE_PHASES_MIN,
  type ConditionIconDto,
  type RoundCycleDto,
  type RoundCycleHolderDto,
  type RoundCycleVisibilityDto,
} from '@lorkarium/contracts';
import type { RoundCycleFields } from '@/services/round-cycle-commands';

/** One phase as the editor holds it: `key` is its row's (stable while it moves), `id` the saved
 *  phase it keeps (none = new). */
export type PhaseDraft = Readonly<{
  key: string;
  id?: string;
  name: string;
  icon: ConditionIconDto;
  imageAssetId: string | null;
}>;

/** The icon a new phase starts with, until the master picks one. */
export const NEW_PHASE_ICON: ConditionIconDto = 'game-icons:cycle';

/** `table`, `character:<id>` or `token:<id>`: the holder as one `<select>` value. */
export type HolderKey = string;

/** The cycle as the editor holds it while the master types. */
export type RoundCycleDraft = Readonly<{
  name: string;
  holder: HolderKey;
  visibility: RoundCycleVisibilityDto;
  seerIds: readonly string[];
  chooserIds: readonly string[];
  announce: boolean;
  phases: readonly PhaseDraft[];
}>;

let nextKey = 0;
const newKey = (): string => `phase-${++nextKey}`;

const emptyPhase = (): PhaseDraft => ({
  key: newKey(),
  name: '',
  icon: NEW_PHASE_ICON,
  imageAssetId: null,
});

/** "Novo ciclo": of the table, seen by everyone, not announced, with two empty phases. */
export const NEW_CYCLE_DRAFT: RoundCycleDraft = Object.freeze({
  name: '',
  holder: 'table',
  visibility: 'everyone',
  seerIds: [],
  chooserIds: [],
  announce: false,
  phases: [emptyPhase(), emptyPhase()],
});

/** Example: `keyOfHolder({ kind: 'character', characterId }) // 'character:<id>'` */
export function keyOfHolder(holder: RoundCycleHolderDto): HolderKey {
  if (holder.kind === 'character') return `character:${holder.characterId}`;
  if (holder.kind === 'token') return `token:${holder.tokenId}`;
  return 'table';
}

/** Example: `holderOfKey('token:<id>') // { kind: 'token', tokenId }` */
export function holderOfKey(key: HolderKey): RoundCycleHolderDto {
  const [kind, id = ''] = key.split(':');
  if (kind === 'character') return { kind: 'character', characterId: id };
  if (kind === 'token') return { kind: 'token', tokenId: id };
  return { kind: 'table' };
}

/** A saved cycle in the editor (the master's: it has `config`).
 *
 *  Example: `draftOfCycle(cycle).phases[0]?.id // its first phase` */
export function draftOfCycle(cycle: RoundCycleDto): RoundCycleDraft {
  const config = cycle.config;
  return {
    name: cycle.name,
    holder: config ? keyOfHolder(config.holder) : 'table',
    visibility: config?.visibility ?? 'everyone',
    seerIds: config?.seerIds ?? [],
    chooserIds: config?.chooserIds ?? [],
    announce: cycle.announce,
    phases: cycle.phases.map(({ id, name, icon, imageAssetId }) => ({
      key: id,
      id,
      name,
      icon,
      imageAssetId,
    })),
  };
}

/** What `cycle:define` / `cycle:update` sends: the names trimmed, the seers only for `some`.
 *
 *  Example: `await commands.defineRoundCycle(scope, fieldsOfDraft(draft))` */
export function fieldsOfDraft(draft: RoundCycleDraft): RoundCycleFields {
  return {
    name: draft.name.trim(),
    holder: holderOfKey(draft.holder),
    visibility: draft.visibility,
    seerIds: draft.visibility === 'some' ? [...draft.seerIds] : [],
    chooserIds: [...draft.chooserIds],
    announce: draft.announce,
    phases: draft.phases.map(({ id, name, icon, imageAssetId }) => ({
      ...(id === undefined ? {} : { id }),
      name: name.trim(),
      icon,
      imageAssetId,
    })),
  };
}

/** Why the draft cannot be saved yet, in the editor's words; `null` = it can.
 *
 *  Example: `draftProblem(draft) // 'Dê um nome à fase 2.'` */
export function draftProblem(draft: RoundCycleDraft): string | null {
  if (draft.name.trim() === '') return 'Dê um nome ao ciclo.';
  const unnamed = draft.phases.findIndex(({ name }) => name.trim() === '');
  if (unnamed !== -1) return `Dê um nome à fase ${unnamed + 1}.`;
  if (draft.visibility === 'some' && draft.seerIds.length === 0) return 'Escolha quem vê o ciclo.';
  return null;
}

/** One more phase, up to `max` (the plan's ceiling, 12 by default).
 *
 *  Example: `withPhaseAdded(draft, 3).phases.length // one more, up to 3` */
export function withPhaseAdded(
  draft: RoundCycleDraft,
  max: number = ROUND_CYCLE_PHASES_MAX,
): RoundCycleDraft {
  if (draft.phases.length >= max) return draft;
  return { ...draft, phases: [...draft.phases, emptyPhase()] };
}

/** Example: `withPhaseRemoved(draft, key).phases.length // one less, down to 2` */
export function withPhaseRemoved(draft: RoundCycleDraft, key: string): RoundCycleDraft {
  if (draft.phases.length <= ROUND_CYCLE_PHASES_MIN) return draft;
  return { ...draft, phases: draft.phases.filter((phase) => phase.key !== key) };
}

/** The phase `key` one place up (`-1`) or down (`1`); at an end it stays.
 *
 *  Example: `withPhaseMoved(draft, key, -1)` */
export function withPhaseMoved(draft: RoundCycleDraft, key: string, by: -1 | 1): RoundCycleDraft {
  const from = draft.phases.findIndex((phase) => phase.key === key);
  const to = from + by;
  const moving = draft.phases[from];
  if (!moving || to < 0 || to >= draft.phases.length) return draft;
  const phases = draft.phases.filter((phase) => phase.key !== key);
  phases.splice(to, 0, moving);
  return { ...draft, phases };
}

/** Example: `withPhaseChanged(draft, key, { name: 'Lua Cheia' })` */
export function withPhaseChanged(
  draft: RoundCycleDraft,
  key: string,
  change: Partial<Pick<PhaseDraft, 'name' | 'icon' | 'imageAssetId'>>,
): RoundCycleDraft {
  const phases = draft.phases.map((phase) => (phase.key === key ? { ...phase, ...change } : phase));
  return { ...draft, phases };
}

/** Who stops seeing also stops choosing (choosing needs seeing).
 *
 *  Example: `withSeerToggled(draft, lyraId)` */
export function withSeerToggled(draft: RoundCycleDraft, userId: string): RoundCycleDraft {
  if (!draft.seerIds.includes(userId)) return { ...draft, seerIds: [...draft.seerIds, userId] };
  const seerIds = draft.seerIds.filter((id) => id !== userId);
  return { ...draft, seerIds, chooserIds: draft.chooserIds.filter((id) => id !== userId) };
}

/** Who starts choosing also starts seeing.
 *
 *  Example: `withChooserToggled(draft, lyraId)` */
export function withChooserToggled(draft: RoundCycleDraft, userId: string): RoundCycleDraft {
  if (draft.chooserIds.includes(userId)) {
    return { ...draft, chooserIds: draft.chooserIds.filter((id) => id !== userId) };
  }
  const seerIds = draft.seerIds.includes(userId) ? draft.seerIds : [...draft.seerIds, userId];
  return { ...draft, seerIds, chooserIds: [...draft.chooserIds, userId] };
}
