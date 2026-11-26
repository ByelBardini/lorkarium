import { CONDITION_ICON_LABELS } from './condition-icon-labels';
import { CONDITION_ICON_WORDS } from './condition-icon-words';
import { conditionKey } from './condition-names';

/** The icon libraries, in the order of the picker's tabs. */
export const CONDITION_ICON_LIBRARIES = ['game-icons', 'lucide', 'tabler', 'ph', 'mdi'] as const;
export type ConditionIconLibrary = (typeof CONDITION_ICON_LIBRARIES)[number];

// Shorter than this, a typed word only counts through the dictionary: "pe" would match "speed".
const RAW_WORD_MIN_LENGTH = 3;

/** The library of an icon key: its prefix, or Lucide for the unprefixed 28 of before.
 *
 *  Example: `conditionIconLibraryOf('skull') // 'lucide'` */
export function conditionIconLibraryOf(key: string): ConditionIconLibrary {
  const colon = key.indexOf(':');
  if (colon < 0) return 'lucide';
  return key.slice(0, colon) as ConditionIconLibrary;
}

/** The icon's name inside its library (the key without the prefix).
 *
 *  Example: `conditionIconNameOf('game-icons:wolf-trap') // 'wolf-trap'` */
export function conditionIconNameOf(key: string): string {
  return key.slice(key.indexOf(':') + 1);
}

const haystacks = new Map<string, string>();

function haystackOf(key: string): string {
  const cached = haystacks.get(key);
  if (cached !== undefined) return cached;
  const label = CONDITION_ICON_LABELS[key] ?? '';
  const haystack = `${conditionIconNameOf(key).replaceAll('-', ' ')} ${conditionKey(label)}`;
  haystacks.set(key, haystack);
  return haystack;
}

function termsOf(word: string): readonly string[] {
  const translated = CONDITION_ICON_WORDS[word]?.split(' ') ?? [];
  return word.length >= RAW_WORD_MIN_LENGTH ? [word, ...translated] : translated;
}

/** The icons that match what was typed, in Portuguese (through the dictionary) or English, with no
 *  case or accent; several words give the icons of any of them. A blank query is the same array.
 *
 *  Example: `searchConditionIcons(CONDITION_ICONS, 'fogo') // [..., 'game-icons:fire', ...]` */
export function searchConditionIcons<K extends string>(
  keys: readonly K[],
  query: string,
): readonly K[] {
  const words = conditionKey(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return keys;
  const terms = words.flatMap(termsOf);
  return keys.filter((key) => terms.some((term) => haystackOf(key).includes(term)));
}

const libraryLists = new WeakMap<readonly string[], Map<ConditionIconLibrary, readonly string[]>>();

/** The icons of one library, in the list order; the same array for the same list and library, so
 *  the grid does not redraw.
 *
 *  Example: `iconsOfLibrary(CONDITION_ICONS, 'tabler')` */
export function iconsOfLibrary<K extends string>(
  keys: readonly K[],
  library: ConditionIconLibrary,
): readonly K[] {
  const lists = libraryLists.get(keys) ?? new Map<ConditionIconLibrary, readonly string[]>();
  libraryLists.set(keys, lists);
  const cached = lists.get(library) as readonly K[] | undefined;
  if (cached) return cached;
  const own = keys.filter((key) => conditionIconLibraryOf(key) === library);
  lists.set(library, own);
  return own;
}
