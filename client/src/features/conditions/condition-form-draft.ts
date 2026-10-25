import { CONDITION_STACKS_MAX, type ActiveConditionDto } from '@lorkarium/contracts';
import type { ConditionFormValues } from './condition-catalog-link';
import { maxStacksOf, stacksDraftOf, type StacksDraft } from './condition-stacks';

/** A condition as the editor holds it while typed: the stacking keeps its text until sent. */
export type ConditionFormDraft = Readonly<
  Omit<ConditionFormValues, 'maxStacks'> & { stacks: StacksDraft }
>;

const PREVIEW_ID = '00000000-0000-4000-8000-000000000000';

/** The editor's starting point from saved (or default) values.
 *
 *  Example: `conditionFormDraftOf(NEW_CONDITION_VALUES).stacks // { on: false, text: '' }` */
export function conditionFormDraftOf(values: ConditionFormValues): ConditionFormDraft {
  const { name, tone, icon, color, look, description, imageAssetId } = values;
  const stacks = stacksDraftOf(values.maxStacks);
  return { name, tone, icon, color, look, description, imageAssetId, stacks };
}

/** What goes to the server: name and description trimmed, the stacks parsed; `null` while the
 *  stacks typed are out of 2..99.
 *
 *  Example: `sentConditionValuesOf({ ...draft, name: ' Cego ' })?.name // 'Cego'` */
export function sentConditionValuesOf(draft: ConditionFormDraft): ConditionFormValues | null {
  const maxStacks = maxStacksOf(draft.stacks);
  if (maxStacks === 'invalid') return null;
  const { tone, icon, color, look, imageAssetId } = draft;
  const name = draft.name.trim();
  const description = draft.description.trim();
  return { name, tone, icon, color, look, description, maxStacks, imageAssetId };
}

/** Whether two sets of values save the same condition.
 *
 *  Example: `sameConditionValues(sent, props.initial) // true when nothing changed` */
export function sameConditionValues(a: ConditionFormValues, b: ConditionFormValues): boolean {
  const keys = [
    'name',
    'tone',
    'icon',
    'color',
    'look',
    'description',
    'maxStacks',
    'imageAssetId',
  ] as const;
  return keys.every((key) => a[key] === b[key]);
}

/** The tag as a token would wear it: 2 rounds left and, when it stacks, 2 stacks.
 *
 *  Example: `<ConditionTagPreview condition={conditionPreviewOf(draft)} />` */
export function conditionPreviewOf(draft: ConditionFormDraft): ActiveConditionDto {
  const { tone, icon, color, look, description, imageAssetId } = draft;
  const maxStacks = maxStacksOf(draft.stacks);
  return {
    id: PREVIEW_ID,
    conditionId: PREVIEW_ID,
    name: draft.name.trim() || 'Sem nome',
    tone,
    icon,
    color,
    look,
    description,
    // A maximum still being typed (say "1") previews as the widest one.
    maxStacks: maxStacks === 'invalid' ? CONDITION_STACKS_MAX : maxStacks,
    imageAssetId,
    stacks: maxStacks === null ? 1 : 2,
    remainingRounds: 2,
  };
}
