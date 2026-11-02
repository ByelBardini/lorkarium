import type { AuthUserDto, CampaignRoleDto } from '@lorkarium/contracts';
import { act, render } from '@testing-library/react';
import { DicePanel } from '@/features/dice/dice-panel';
import { ANA } from './auth-api-fake';
import { VHARN } from './campaigns-api-fake';
import { BIA_AT_TABLE, vharnState } from './table-session-fixtures';
import type { TestDependencies } from './app-dependencies';

/** Bia's account, signed in: her rolls are "mine" in the history. */
export const BIA_ACCOUNT: AuthUserDto = {
  ...ANA,
  id: BIA_AT_TABLE.userId,
  username: 'bia',
  name: 'Bia',
  email: 'bia@mesa.com',
};

/** Opens Vharn in the tab (its dice history born with it) and plays the roster snapshot. */
export function openVharnWithRoster(deps: TestDependencies): void {
  act(() => {
    deps.sessionStore.getState().signedIn(BIA_ACCOUNT);
    deps.openTables.getState().restore(BIA_ACCOUNT.id);
    deps.openTables.getState().open({
      campaignId: VHARN.id,
      name: 'Vharn',
      cover: VHARN.cover,
    });
  });
  deps.tableSessionApi.emitTo(VHARN.id, { kind: 'state', state: vharnState() });
}

/** The "Dados" tab of Vharn alone.
 *
 *  Example: `renderDicePanel(deps, 'spectator')` */
export function renderDicePanel(deps: TestDependencies, role: CampaignRoleDto = 'player'): void {
  const table = deps.openTables.getState().tables.find((open) => open.campaignId === VHARN.id);
  const panel = (
    <DicePanel
      campaignId={VHARN.id}
      role={role}
      sessionStore={deps.sessionStore}
      openTables={deps.openTables}
      presence={table?.presence ?? null}
      services={deps}
    />
  );
  render(panel);
}
