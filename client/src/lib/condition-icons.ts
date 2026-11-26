import type { ConditionIconDto } from '@lorkarium/contracts';
import { CONDITION_ICON_LABELS } from './condition-icon-labels';
import { conditionIconLibraryOf, conditionIconNameOf } from './condition-icon-search';
import { CONDITION_ICONS_VERSION } from './condition-icon-version';

/** The file of an icon inside the versioned folder: its library, then its name (the 28 of before
 *  are Lucide's).
 *
 *  Example: `conditionIconFileOf('skull') // 'lucide/skull.svg'` */
export function conditionIconFileOf(icon: string): string {
  return `${conditionIconLibraryOf(icon)}/${conditionIconNameOf(icon)}.svg`;
}

/** Where the white SVG of an icon is served (cached for good: the folder changes with the icons).
 *  The board tints it, the DOM uses it as a mask.
 *
 *  Example: `conditionIconUrlOf('game-icons:manacles') // '/condition-icons/<v>/game-icons/manacles.svg'` */
export function conditionIconUrlOf(icon: ConditionIconDto): string {
  return `/condition-icons/${CONDITION_ICONS_VERSION}/${conditionIconFileOf(icon)}`;
}

/** The accessible name of an icon: its pt-BR name, or its English key made readable.
 *
 *  Example: `conditionIconLabelOf('game-icons:wolf-head') // 'Wolf head'` */
export function conditionIconLabelOf(icon: ConditionIconDto): string {
  const label = CONDITION_ICON_LABELS[icon];
  if (label) return label;
  const words = conditionIconNameOf(icon).replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
