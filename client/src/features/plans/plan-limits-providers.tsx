import type { CampaignInfoDto } from '@lorkarium/contracts';
import { useContext, useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  CustomColorLocksContext,
  type CustomColorLocks,
} from '@/components/color-picker/custom-color-locks';
import { selectTableLimits, useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';
import type { AccountLimits } from '@/stores/session-store';
import { customizationGate, featureGate } from './plan-gate';
import { AccountPlanContext, TablePlanLimitsContext } from './use-plan-limits';

type AccountPlanProviderProps = Readonly<{ account: AccountLimits; children: React.ReactNode }>;

/** Gives the signed-in account's plan to the whole shell (and its custom color lock).
 *
 *  Example: `<AccountPlanProvider account={session.user}>…</AccountPlanProvider>` */
export function AccountPlanProvider({
  account,
  children,
}: AccountPlanProviderProps): React.JSX.Element {
  const outer = useContext(CustomColorLocksContext);
  const lock = customizationGate(account.customization).hint;
  const locks = useMemo<CustomColorLocks>(() => ({ ...outer, account: lock }), [outer, lock]);
  return (
    <AccountPlanContext value={account}>
      <CustomColorLocksContext value={locks}>{children}</CustomColorLocksContext>
    </AccountPlanContext>
  );
}

type TablePlanLimitsProviderProps = Readonly<{
  openTables: StoreApi<OpenTablesStore>;
  campaign: Pick<CampaignInfoDto, 'id' | 'limits'>;
  children: React.ReactNode;
}>;

/** Gives the table's limits to its route (room, library, settings, conditions): live from the
 *  open tables once a `session:campaignUpdated` came, the route's campaign before that.
 *
 *  Example: `<TablePlanLimitsProvider openTables={openTables} campaign={campaign}>…</TablePlanLimitsProvider>` */
export function TablePlanLimitsProvider({
  openTables,
  campaign,
  children,
}: TablePlanLimitsProviderProps): React.JSX.Element {
  const limits = useOpenTables(openTables, (state) => selectTableLimits(state, campaign));
  const outer = useContext(CustomColorLocksContext);
  const lock = featureGate(limits, (offer) => offer.customColor).hint;
  const locks = useMemo<CustomColorLocks>(() => ({ ...outer, table: lock }), [outer, lock]);
  return (
    <TablePlanLimitsContext value={limits}>
      <CustomColorLocksContext value={locks}>{children}</CustomColorLocksContext>
    </TablePlanLimitsContext>
  );
}
