import type { SessionMemberDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { MemberRoleProvider } from '@/features/sessions/member-role-provider';
import { SessionPresencePanel } from '@/features/sessions/session-presence-panel';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { CampaignsApiFake, VHARN } from '../../support/campaigns-api-fake';
import {
  charactersSynced,
  kaelCharacter,
  linkedKael,
  linkedLyra,
  lyraCharacter,
} from '../../support/character-fixtures';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  biaLeft,
  biaUpdated,
  duda,
  vharnBoard,
  vharnState,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const BIA_ONLINE: SessionMemberDto = { ...BIA_AT_TABLE, online: true };
const EVERYONE = [ANA_AT_TABLE, BIA_ONLINE, CAIO_AT_TABLE];

describe('SessionPresencePanel', () => {
  let presence: StoreApi<TablePresenceStore>;
  let board: StoreApi<BoardStore>;
  let characters: StoreApi<CharactersStore>;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    presence = createTablePresenceStore(VHARN.id);
    board = createBoardStore(VHARN.id, () => undefined);
    characters = createCharactersStore(VHARN.id, () => undefined);
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
  });

  function renderPanel(members: SessionMemberDto[] = EVERYONE, withBoard = true): void {
    act(() => {
      presence.getState().apply({ kind: 'state', state: vharnState({ members }) });
      presence.getState().apply({ kind: 'status', status: 'live' });
      if (!withBoard) return;
      const tokens = [linkedLyra(), linkedKael()];
      board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
      characters.getState().apply(charactersSynced(3, lyraCharacter(), kaelCharacter()));
    });
    render(
      <SessionPresencePanel
        store={presence}
        board={board}
        characters={characters}
        interaction={interaction}
        isMaster={true}
        ownerId={VHARN.ownerId}
        clock={new InteractionClockFake()}
      />,
    );
  }

  const section = (name: string | RegExp) => screen.getByRole('region', { name });
  const cardTitles = () =>
    within(section(/^Jogadores/))
      .getAllByRole('article')
      .map((card) => card.getAttribute('aria-labelledby'))
      .map((id) => (id ? document.getElementById(id)?.textContent : null));

  it('Ana goes to "Mestre" with the seal of the owner, Bia and Caio to "Jogadores · 2 online" as cards', () => {
    renderPanel();

    const masters = section('Mestre');
    expect(within(masters).getByText('Ana')).toBeInTheDocument();
    expect(within(masters).getByText('Dono', { selector: '[data-seal]' })).toBeInTheDocument();
    expect(section('Jogadores · 2 online')).toBeInTheDocument();
    expect(cardTitles()).toEqual(['Lyra', 'Kael']);
  });

  it('the master row shows the avatar of the account: the photo when there is one', () => {
    const avatarId = '3c1b2a09-8f7e-4d6c-9b5a-4e3d2c1b0a99';
    renderPanel([{ ...ANA_AT_TABLE, avatarId }, BIA_ONLINE, CAIO_AT_TABLE]);

    expect(within(section('Mestre')).getByTestId('avatar-photo')).toHaveAttribute(
      'src',
      `/api/avatars/${avatarId}`,
    );
  });

  it('the master row without a photo shows the initials over the color of the account', () => {
    renderPanel();

    const initials = within(section('Mestre')).getByTestId('avatar-initials');
    expect(initials).toHaveTextContent('AN');
    expect(initials).toHaveStyle({ backgroundColor: '#5cc8c0' });
  });

  it("the master's presence rides on the avatar, not before the nick", () => {
    renderPanel();

    const masters = section('Mestre');
    expect(within(masters).getByRole('img', { name: 'online' })).toBeInTheDocument();
    expect(within(within(masters).getByTestId('nick-line')).queryByRole('img')).toBeNull();
  });

  it("while the characters load, the player's presence goes before the nick (no portrait to wear it)", () => {
    renderPanel(EVERYONE, false);

    const bia = within(section(/^Jogadores/)).getAllByTestId('nick-line')[0];
    expect(within(bia!).getByRole('img', { name: 'online' })).toBeInTheDocument();
  });

  it('two masters read "Mestres"', () => {
    renderPanel([ANA_AT_TABLE, BIA_ONLINE, { ...CAIO_AT_TABLE, role: 'master' }]);

    expect(within(section('Mestres')).getByText('Caio')).toBeInTheDocument();
  });

  it('a player leaving goes to the end, dimmed, and the title counts one less online', () => {
    renderPanel([ANA_AT_TABLE, BIA_ONLINE, CAIO_AT_TABLE]);

    act(() => presence.getState().apply({ kind: 'memberLeft', event: biaLeft() }));

    expect(section('Jogadores · 1 online')).toBeInTheDocument();
    expect(cardTitles()).toEqual(['Kael', 'Lyra']);
  });

  it('a table without players says so', () => {
    renderPanel([ANA_AT_TABLE]);

    expect(section('Jogadores · 0 online')).toHaveTextContent('Nenhum jogador nesta mesa ainda.');
  });

  it('while the characters load, the sections show the presence only (no portrait, bars or fields)', () => {
    renderPanel(EVERYONE, false);

    expect(within(section(/^Jogadores/)).getByText('Bia')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('a not_found failure shows the alert in place of the sections', () => {
    act(() => presence.getState().apply({ kind: 'failed', failure: 'not_found' }));
    render(
      <SessionPresencePanel
        store={presence}
        board={board}
        characters={characters}
        interaction={interaction}
        isMaster
        ownerId={VHARN.ownerId}
        clock={new InteractionClockFake()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Essa mesa não existe ou você não participa dela.',
    );
    expect(screen.queryByRole('region', { name: /^Jogadores/ })).toBeNull();
  });

  it('reads "Conectando à mesa…" until the snapshot', () => {
    render(
      <SessionPresencePanel
        store={presence}
        board={board}
        characters={characters}
        interaction={interaction}
        isMaster
        ownerId={VHARN.ownerId}
        clock={new InteractionClockFake()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Conectando à mesa…');
  });

  it('once live the status line says nothing', () => {
    renderPanel();

    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.queryByText('Ao vivo')).toBeNull();
  });

  describe('spectators and roles', () => {
    let campaigns: CampaignsApiFake;

    beforeEach(() => {
      campaigns = new CampaignsApiFake();
    });

    function renderAs(viewer: SessionMemberDto, members: SessionMemberDto[]): void {
      const isMaster = viewer.role === 'master';
      act(() => {
        presence.getState().apply({ kind: 'state', state: vharnState({ members }) });
        presence.getState().apply({ kind: 'status', status: 'live' });
        const tokens = [linkedLyra(), linkedKael()];
        const view = { userId: viewer.userId, role: viewer.role };
        board.getState().apply({ kind: 'board', state: vharnBoard({ tokens, viewer: view }) });
        characters.getState().apply(charactersSynced(3, lyraCharacter(), kaelCharacter()));
      });
      render(
        <MemberRoleProvider changer={campaigns}>
          <SessionPresencePanel
            store={presence}
            board={board}
            characters={characters}
            interaction={interaction}
            isMaster={isMaster}
            ownerId={VHARN.ownerId}
            clock={new InteractionClockFake()}
          />
        </MemberRoleProvider>,
      );
    }

    const promote = () => screen.getByRole('button', { name: 'Promover Duda a jogador' });

    async function askToMoveBia(): Promise<HTMLElement> {
      await userEvent.click(screen.getByRole('button', { name: 'Mais ações de Bia' }));
      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'Mover para espectadores' }),
      );
      return screen.getByRole('alertdialog', { name: 'Mover Bia para espectadores?' });
    }

    it('Ana sees "Espectadores · 1" with Duda online and the button to promote her', () => {
      renderAs(ANA_AT_TABLE, [...EVERYONE, duda()]);

      const spectators = section('Espectadores · 1');
      expect(within(spectators).getByText('Duda')).toBeInTheDocument();
      expect(within(spectators).getByTestId('avatar-initials')).toHaveTextContent('DU');
      expect(within(spectators).getByRole('img', { name: 'online' })).toBeInTheDocument();
      expect(within(spectators).getByRole('button', { name: 'Promover Duda a jogador' })).toBe(
        promote(),
      );
      expect(within(section(/^Jogadores/)).queryByText('Duda')).toBeNull();
    });

    it('promoting sends the role player and reads "Promovendo…" while it goes', async () => {
      const answer = campaigns.hold('setMemberRole');
      renderAs(ANA_AT_TABLE, [...EVERYONE, duda()]);

      await userEvent.click(promote());

      expect(campaigns.callsOf('setMemberRole')).toEqual([
        { campaignId: VHARN.id, userId: duda().userId, role: 'player' },
      ]);
      expect(promote()).toHaveTextContent('Promovendo…');
      expect(promote()).toBeDisabled();
      await act(async () => answer({ ok: false, failure: { kind: 'offline' } }));
      expect(promote()).toHaveTextContent('Promover');
    });

    it('a refused promotion shows the reason in the row', async () => {
      campaigns.answer('setMemberRole', { ok: false, failure: { kind: 'member_not_found' } });
      renderAs(ANA_AT_TABLE, [...EVERYONE, duda()]);

      await userEvent.click(promote());

      expect(await within(section('Espectadores · 1')).findByRole('alert')).toHaveTextContent(
        'Essa pessoa não está mais na mesa.',
      );
    });

    it('once the server confirms, Duda leaves the spectators for the players', () => {
      renderAs(ANA_AT_TABLE, [...EVERYONE, duda()]);

      act(() =>
        presence.getState().apply({
          kind: 'memberUpdated',
          event: biaUpdated({ version: 2, member: duda({ role: 'player' }) }),
        }),
      );

      expect(screen.queryByRole('region', { name: /^Espectadores/ })).toBeNull();
      expect(within(section('Jogadores · 3 online')).getByText('Duda')).toBeInTheDocument();
    });

    it('Bia, a player, sees the spectators without the button, and no "⋯" on the cards', () => {
      renderAs(BIA_ONLINE, [...EVERYONE, duda()]);

      expect(within(section('Espectadores · 1')).getByText('Duda')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Promover/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Mais ações de/ })).toBeNull();
    });

    it('without a spectator online, there is no section', () => {
      renderAs(ANA_AT_TABLE, [...EVERYONE, duda({ online: false })]);

      expect(screen.queryByRole('region', { name: /^Espectadores/ })).toBeNull();
    });

    it("'Mover para espectadores' on Bia's card asks first, then sends the role spectator", async () => {
      renderAs(ANA_AT_TABLE, EVERYONE);

      const confirm = await askToMoveBia();

      expect(confirm).toHaveAccessibleDescription(
        'Tokens, ficha e personagem ficam guardados e voltam numa nova promoção.',
      );
      expect(within(confirm).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(campaigns.callsOf('setMemberRole')).toEqual([]);
      await userEvent.click(within(confirm).getByRole('button', { name: 'Mover' }));
      expect(campaigns.callsOf('setMemberRole')).toEqual([
        { campaignId: VHARN.id, userId: BIA_AT_TABLE.userId, role: 'spectator' },
      ]);
    });

    it('Esc closes the question and nothing goes', async () => {
      renderAs(ANA_AT_TABLE, EVERYONE);
      await askToMoveBia();

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(campaigns.callsOf('setMemberRole')).toEqual([]);
    });

    it('a refused move shows the reason on the card', async () => {
      campaigns.answer('setMemberRole', { ok: false, failure: { kind: 'forbidden' } });
      renderAs(ANA_AT_TABLE, EVERYONE);
      const confirm = await askToMoveBia();

      await userEvent.click(within(confirm).getByRole('button', { name: 'Mover' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Só o mestre da mesa pode fazer isso.',
      );
    });
  });
});
