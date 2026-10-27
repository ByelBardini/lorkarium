import type { SessionMemberDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { MemberRoleProvider } from '@/features/sessions/member-role-provider';
import { SessionPresencePanel } from '@/features/sessions/session-presence-panel';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import { createBoardStore } from '@/stores/board-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { CampaignsApiFake, VHARN } from '../../support/campaigns-api-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  biaLeft,
  duda,
  lyra,
  rootJuggernaut,
  vharnBoard,
  vharnState,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const BIA_PLAYER: SessionMemberDto = { ...BIA_AT_TABLE, online: true };
const BIA_MASTER: SessionMemberDto = { ...BIA_PLAYER, role: 'master' };
const EDU_MASTER = duda({
  userId: '5f6e7d8c-9b0a-4c1d-8e2f-3a4b5c6d7e8f',
  name: 'Edu',
  username: 'edu',
  role: 'master',
});

describe('SessionPresencePanel, owner, co-masters and juggernaut', () => {
  let presence: StoreApi<TablePresenceStore>;
  let campaigns: CampaignsApiFake;

  beforeEach(() => {
    presence = createTablePresenceStore(VHARN.id);
    campaigns = new CampaignsApiFake();
  });

  function renderAs(viewer: SessionMemberDto, members: SessionMemberDto[]): void {
    const board = createBoardStore(VHARN.id, () => undefined);
    act(() => {
      presence.getState().apply({ kind: 'state', state: vharnState({ members }) });
      presence.getState().apply({ kind: 'status', status: 'live' });
      const view = { userId: viewer.userId, role: viewer.role };
      board
        .getState()
        .apply({ kind: 'board', state: vharnBoard({ tokens: [lyra()], viewer: view }) });
    });
    render(
      <MemberRoleProvider changer={campaigns}>
        <SessionPresencePanel
          store={presence}
          board={board}
          cast={createBoardStore(VHARN.id, () => undefined)}
          interaction={createBoardInteractionStore({
            scopeOf: () => VHARN_GRID,
            commands: new TableBoardCommandsFake(),
            describeRefusal: String,
          })}
          isMaster={viewer.role === 'master'}
          ownerId={VHARN.ownerId}
          clock={new InteractionClockFake()}
        />
      </MemberRoleProvider>,
    );
  }

  const section = (name: string | RegExp) => screen.getByRole('region', { name });
  const rowOf = (name: string): HTMLElement => {
    const row = screen.getAllByRole('listitem').find((item) => within(item).queryByText(name));
    if (!row) throw new Error(`no row of ${name}`);
    return row;
  };
  const menuOf = (name: string) => screen.queryByRole('button', { name: `Mais ações de ${name}` });
  const sentRoles = () => campaigns.callsOf('setMemberRole');

  async function pick(name: string, item: string): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: `Mais ações de ${name}` }));
    await userEvent.click(await screen.findByRole('menuitem', { name: item }));
  }

  async function menuItemsOf(name: string): Promise<string[]> {
    await userEvent.click(screen.getByRole('button', { name: `Mais ações de ${name}` }));
    const items = await screen.findAllByRole('menuitem');
    return items.map((item) => item.textContent ?? '');
  }

  it('Root the juggernaut has his own section before the masters, sealed "Juggernaut"', () => {
    renderAs(ANA_AT_TABLE, [ANA_AT_TABLE, BIA_MASTER, rootJuggernaut(), CAIO_AT_TABLE]);

    const names = screen.getAllByRole('region').map(accessibleNameOf);
    expect(names.filter((name) => name !== 'Na mesa').slice(0, 2)).toEqual([
      'Juggernaut',
      'Mestres',
    ]);
    const juggernaut = section('Juggernaut');
    expect(within(juggernaut).getByText('Root')).toBeInTheDocument();
    expect(
      within(juggernaut).getByText('Juggernaut', { selector: '[data-seal]' }),
    ).toBeInTheDocument();
    expect(within(section('Mestres')).queryByText('Root')).toBeNull();
  });

  it('the juggernaut section is gone once Root leaves the table', () => {
    renderAs(ANA_AT_TABLE, [ANA_AT_TABLE, rootJuggernaut(), CAIO_AT_TABLE]);

    act(() =>
      presence.getState().apply({
        kind: 'memberLeft',
        event: biaLeft({ version: 2, userId: rootJuggernaut().userId }),
      }),
    );

    expect(screen.queryByRole('region', { name: 'Juggernaut' })).toBeNull();
    expect(screen.queryByText('Root')).toBeNull();
  });

  it('Ana the owner wears the seal "Dono" and Bia the co-master "Mestre"', () => {
    renderAs(ANA_AT_TABLE, [BIA_MASTER, ANA_AT_TABLE, CAIO_AT_TABLE]);

    expect(within(rowOf('Ana')).getByText('Dono', { selector: '[data-seal]' })).toBeInTheDocument();
    expect(
      within(rowOf('Bia')).getByText('Mestre', { selector: '[data-seal]' }),
    ).toBeInTheDocument();
  });

  it("Ana confirms 'Tornar mestre' on Bia's card and the role master goes", async () => {
    renderAs(ANA_AT_TABLE, [ANA_AT_TABLE, BIA_PLAYER, CAIO_AT_TABLE]);

    await pick('Bia', 'Tornar mestre');
    const confirm = screen.getByRole('alertdialog', { name: 'Tornar Bia mestre?' });

    expect(confirm).toHaveAccessibleDescription(
      'Bia passa a ver grids privados, tokens ocultos e rolagens secretas.',
    );
    expect(sentRoles()).toEqual([]);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Tornar mestre' }));
    expect(sentRoles()).toEqual([
      { campaignId: VHARN.id, userId: BIA_AT_TABLE.userId, role: 'master' },
    ]);
  });

  it("Ana's 'Tornar mestre' on Duda's row closes with Esc and nothing goes", async () => {
    renderAs(ANA_AT_TABLE, [ANA_AT_TABLE, CAIO_AT_TABLE, duda()]);

    await pick('Duda', 'Tornar mestre');
    expect(screen.getByRole('alertdialog', { name: 'Tornar Duda mestre?' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sentRoles()).toEqual([]);
  });

  it("Ana's menu on the co-master Bia moves her to the players at once", async () => {
    renderAs(ANA_AT_TABLE, [ANA_AT_TABLE, BIA_MASTER, CAIO_AT_TABLE]);

    expect(await menuItemsOf('Bia')).toEqual(['Mover para jogadores', 'Mover para espectadores']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mover para jogadores' }));

    expect(sentRoles()).toEqual([
      { campaignId: VHARN.id, userId: BIA_AT_TABLE.userId, role: 'player' },
    ]);
  });

  it('a refused demotion of the co-master shows the reason in her row', async () => {
    campaigns.answer('setMemberRole', { ok: false, failure: { kind: 'forbidden' } });
    renderAs(ANA_AT_TABLE, [ANA_AT_TABLE, BIA_MASTER, CAIO_AT_TABLE]);

    await pick('Bia', 'Mover para jogadores');

    expect(await within(rowOf('Bia')).findByRole('alert')).toHaveTextContent(
      'Só o mestre da mesa pode fazer isso.',
    );
  });

  it('Bia the co-master swaps players and spectators, but never touches a master', async () => {
    renderAs(BIA_MASTER, [ANA_AT_TABLE, BIA_MASTER, EDU_MASTER, CAIO_AT_TABLE, duda()]);

    expect(screen.getByRole('button', { name: 'Promover Duda a jogador' })).toBeInTheDocument();
    expect(menuOf('Duda')).toBeNull();
    expect(menuOf('Ana')).toBeNull();
    expect(menuOf('Edu')).toBeNull();
    expect(await menuItemsOf('Caio')).toEqual(['Mover para espectadores']);
  });

  it('nobody has a menu on the juggernaut, and the juggernaut none on the owner', () => {
    renderAs(rootJuggernaut(), [ANA_AT_TABLE, rootJuggernaut(), BIA_MASTER, CAIO_AT_TABLE]);

    expect(menuOf('Root')).toBeNull();
    expect(menuOf('Ana')).toBeNull();
    expect(menuOf('Bia')).not.toBeNull();
  });

  it('Bia as a spectator has no role control left anywhere (assignableRolesOf)', () => {
    const biaSpectator: SessionMemberDto = { ...BIA_PLAYER, role: 'spectator' };
    renderAs(biaSpectator, [ANA_AT_TABLE, biaSpectator, CAIO_AT_TABLE, duda()]);

    expect(screen.queryByRole('button', { name: /^Mais ações de/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Promover/ })).toBeNull();
  });
});

function accessibleNameOf(region: HTMLElement): string {
  const id = region.getAttribute('aria-labelledby');
  return (id ? document.getElementById(id)?.textContent : null) ?? '';
}
