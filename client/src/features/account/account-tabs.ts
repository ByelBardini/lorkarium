import type { ProfileDraftField } from './use-profile-draft';

/** A tab of "Minha conta", as it is written in `?aba=`. */
export type AccountTab = 'perfil' | 'dados' | 'seguranca' | 'plano';

/** The query parameter that keeps the open tab: reloading or going back lands on it again. */
export const ACCOUNT_TAB_PARAM = 'aba';

/** The tabs in their order, with the label of each trigger. */
export const ACCOUNT_TABS: readonly Readonly<{ value: AccountTab; label: string }>[] = [
  { value: 'perfil', label: 'Perfil' },
  { value: 'dados', label: 'Dados' },
  { value: 'seguranca', label: 'Segurança' },
  { value: 'plano', label: 'Plano' },
];

const DEFAULT_ACCOUNT_TAB: AccountTab = 'perfil';

// Where each draft field is edited: the dot on the trigger points at the tab to go back to.
const TAB_OF_FIELD: Readonly<Record<ProfileDraftField, AccountTab>> = {
  name: 'perfil',
  color: 'perfil',
  bio: 'perfil',
  diceNumberColor: 'dados',
};

/** The tab a `?aba=` value names; missing or unknown is "Perfil".
 *
 *  Example: `accountTabOf(params.get(ACCOUNT_TAB_PARAM)) // 'seguranca' for ?aba=seguranca` */
export function accountTabOf(value: string | null): AccountTab {
  const known = ACCOUNT_TABS.find((tab) => tab.value === value);
  return known ? known.value : DEFAULT_ACCOUNT_TAB;
}

/** The tabs holding an unsaved edit of the profile draft.
 *
 *  Example: `accountTabsWithEdits(['bio', 'diceNumberColor']) // Set { 'perfil', 'dados' }` */
export function accountTabsWithEdits(
  changed: readonly ProfileDraftField[],
): ReadonlySet<AccountTab> {
  return new Set(changed.map((field) => TAB_OF_FIELD[field]));
}

/** The query of a tab: "Perfil", the default, leaves `/account` clean.
 *
 *  Example: `accountTabSearch('plano') // '?aba=plano'` */
export function accountTabSearch(tab: AccountTab): string {
  return tab === DEFAULT_ACCOUNT_TAB ? '' : `?${ACCOUNT_TAB_PARAM}=${tab}`;
}
