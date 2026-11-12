import { createContext, useContext } from 'react';

/** Whose plan rules a custom color: the account's (profile, dice, saved colors) or the table
 *  owner's (the table's content). A field with neither (a cover tone, a map place) is free. */
export type CustomColorScope = 'account' | 'table';

/** Why the custom color is off in each scope (the hint), or `null` where it is offered. */
export type CustomColorLocks = Readonly<Record<CustomColorScope, string | null>>;

const UNLOCKED: CustomColorLocks = { account: null, table: null };

/** Given by the plans (the shell for the account, the table route for the table); outside them
 *  nothing is locked: the server still refuses. */
export const CustomColorLocksContext = createContext<CustomColorLocks>(UNLOCKED);

/** The hint that keeps the custom color off in `scope`; `null` when offered or with no scope.
 *
 *  Example: `const lock = useCustomColorLock('table') // 'Disponível no Narrador' on a free table` */
export function useCustomColorLock(scope: CustomColorScope | undefined): string | null {
  const locks = useContext(CustomColorLocksContext);
  return scope === undefined ? null : locks[scope];
}
