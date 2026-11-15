import type { SettingsSectionKey } from './settings-sections';
import type { SettingsValues } from './use-campaign-settings-draft';

/** Below this, "Sobre a mesa" says too little for someone deciding to join. */
const DESCRIPTION_READY_LENGTH = 20;
const TAGS_READY_COUNT = 2;

export type ReadinessValues = Pick<SettingsValues, 'name' | 'description' | 'cover' | 'tags'>;

export type ReadinessItem = Readonly<{
  key: 'name' | 'description' | 'coverImage' | 'tags';
  label: string;
  done: boolean;
  /** Where the master fixes it. */
  section: SettingsSectionKey;
}>;

/** "Pronta pra receber gente": what makes the campaign inviting to whoever finds it, from the
 *  draft (so it follows the typing).
 *
 *  Example: `readinessOf(draft.values).filter((item) => item.done).length` */
export function readinessOf(values: ReadinessValues): readonly ReadinessItem[] {
  return [
    { key: 'name', label: 'Nome', done: values.name.trim() !== '', section: 'general' },
    {
      key: 'description',
      label: 'Sobre a mesa',
      done: values.description.trim().length >= DESCRIPTION_READY_LENGTH,
      section: 'general',
    },
    {
      key: 'coverImage',
      label: 'Capa com imagem',
      done: values.cover.kind === 'image',
      section: 'images',
    },
    {
      key: 'tags',
      label: `Pelo menos ${TAGS_READY_COUNT} tags`,
      done: values.tags.length >= TAGS_READY_COUNT,
      section: 'content',
    },
  ];
}
