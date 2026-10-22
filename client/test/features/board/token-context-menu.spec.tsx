import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { TokenContextMenu, type TokenMenuRequest } from '@/features/board/token-context-menu';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  kael,
  lyra,
  vharnBoard,
} from '../../support/table-session-fixtures';

const GOBLIN_ID = '7f6e5d4c-3b2a-4f1e-8d9c-0b1a2c3d4e5f';

describe('TokenContextMenu', () => {
  let board: StoreApi<BoardStore>;
  let presence: StoreApi<TablePresenceStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;
  let closed: number;
  let conditionTargets: Array<readonly string[]>;
  let imageOf: string[];

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    presence = createTablePresenceStore(VHARN.id);
    presence.setState({ members: [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE] });
    const goblin = lyra({ id: GOBLIN_ID, name: 'Goblin', layer: 'objects' });
    board
      .getState()
      .apply({ kind: 'board', state: vharnBoard({ tokens: [lyra(), kael(), goblin] }) });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
    interaction.getState().allowLayerChoice(true);
    closed = 0;
    conditionTargets = [];
    imageOf = [];
  });

  function openOn(tokenId: string): void {
    const request: TokenMenuRequest = { tokenId, x: 120, y: 80 };
    render(
      <TokenContextMenu
        request={request}
        board={board}
        presence={presence}
        interaction={interaction}
        onApplyCondition={(tokenIds) => conditionTargets.push(tokenIds)}
        onChangeImage={(tokenId) => imageOf.push(tokenId)}
        onClose={() => (closed += 1)}
      />,
    );
  }

  it('opens "Ações de Goblin" with the layer of the token checked under "Mover para camada"', () => {
    openOn(GOBLIN_ID);
    expect(screen.getByRole('menu', { name: 'Ações de Goblin' })).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Mover para camada' })).not.toBeNull();
    expect(screen.getByRole('menuitemradio', { name: 'Objetos' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('on a token of a selection of three, "Objetos" moves the three', async () => {
    interaction.getState().selectMany([LYRA_ID, KAEL_ID, GOBLIN_ID], { additive: false });
    openOn(KAEL_ID);
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Objetos' }));
    expect(commands.sentAs('setTokenLayer').map(({ fields }) => fields)).toEqual([
      { tokenIds: [LYRA_ID, KAEL_ID, GOBLIN_ID], layer: 'objects' },
    ]);
    expect(closed).toBe(1);
  });

  it('on a token outside the selection, only that token moves', async () => {
    interaction.getState().selectMany([LYRA_ID, GOBLIN_ID], { additive: false });
    openOn(KAEL_ID);
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Fundo' }));
    expect(commands.sentAs('setTokenLayer').map(({ fields }) => fields)).toEqual([
      { tokenIds: [KAEL_ID], layer: 'background' },
    ]);
  });

  it('Esc closes it without sending anything', async () => {
    openOn(LYRA_ID);
    await userEvent.keyboard('{Escape}');
    expect(closed).toBe(1);
    expect(commands.sent).toEqual([]);
  });

  it('a refused change says why on the status line', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    openOn(LYRA_ID);
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Fundo' }));
    await act(() => Promise.resolve());
    expect(interaction.getState().notice).toBe('recusado: forbidden');
  });

  it('"Aplicar condição…" on a token of the selection asks for the whole selection', async () => {
    interaction.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false });
    openOn(KAEL_ID);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Aplicar condição…' }));
    expect(conditionTargets).toEqual([[LYRA_ID, KAEL_ID]]);
    expect(closed).toBe(1);
  });

  it('"Aplicar condição…" on a token outside the selection asks for that token alone', async () => {
    interaction.getState().selectMany([LYRA_ID, GOBLIN_ID], { additive: false });
    openOn(KAEL_ID);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Aplicar condição…' }));
    expect(conditionTargets).toEqual([[KAEL_ID]]);
  });

  describe('"Morto", for whoever controls the token', () => {
    it('marks a living token defeated, with or without an image', async () => {
      openOn(KAEL_ID);

      const dead = screen.getByRole('menuitemcheckbox', { name: 'Morto' });
      expect(dead).toHaveAttribute('aria-checked', 'false');
      await userEvent.click(dead);

      expect(commands.sentAs('restyleTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: [KAEL_ID], style: { defeated: true } },
      ]);
    });

    it('on a defeated token of the selection, brings the whole selection back', async () => {
      const fallen = { defeated: true };
      board.getState().apply({
        kind: 'board',
        state: vharnBoard({ tokens: [lyra(fallen), kael(fallen)] }),
      });
      interaction.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false });
      openOn(LYRA_ID);

      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Morto' }));

      expect(commands.sentAs('restyleTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: [LYRA_ID, KAEL_ID], style: { defeated: false } },
      ]);
    });
  });

  describe('"Luz acesa", for whoever controls the token', () => {
    const TORCH = { bright: 4, dim: 4, color: null, angle: 360 };

    function withTokens(...tokens: ReturnType<typeof lyra>[]): void {
      board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
    }

    it('the menu of Bia on her Lyra with the torch lit has "Luz acesa" checked', () => {
      interaction.getState().allowLayerChoice(false);
      withTokens(lyra({ light: TORCH, lightLit: true, canControl: true }));
      openOn(LYRA_ID);

      expect(screen.getByRole('menuitemcheckbox', { name: 'Luz acesa' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('clicking it puts out the light of Lyra', async () => {
      withTokens(lyra({ light: TORCH, lightLit: true, canControl: true }));
      openOn(LYRA_ID);

      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Luz acesa' }));

      expect(commands.sentAs('restyleTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: [LYRA_ID], style: { lightLit: false } },
      ]);
    });

    it('a token without light has no "Luz acesa"', () => {
      withTokens(lyra({ light: null, canControl: true }));
      openOn(LYRA_ID);

      expect(screen.queryByRole('menuitemcheckbox', { name: 'Luz acesa' })).toBeNull();
    });

    it('a player who does not control the token has no "Luz acesa"', () => {
      interaction.getState().allowLayerChoice(false);
      withTokens(lyra({ light: TORCH, canControl: false }));
      openOn(LYRA_ID);

      expect(screen.queryByRole('menuitemcheckbox', { name: 'Luz acesa' })).toBeNull();
    });

    it('the master lights a brazier token on the objects layer that was out', async () => {
      const brazier = lyra({ id: GOBLIN_ID, name: 'Braseiro', layer: 'objects' });
      withTokens({ ...brazier, light: TORCH, lightLit: false, canControl: true });
      openOn(GOBLIN_ID);

      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Luz acesa' }));

      expect(commands.sentAs('restyleTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: [GOBLIN_ID], style: { lightLit: true } },
      ]);
    });
  });

  describe('the look, for whoever controls the token', () => {
    const PORTRAIT_ID = '4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d';

    function withPortrait(overrides: Parameters<typeof lyra>[0] = {}): void {
      const portrait = lyra({ imageAssetId: PORTRAIT_ID, ...overrides });
      board.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [portrait, kael()] }) });
    }

    function restyled(): unknown[] {
      return commands.sentAs('restyleTokens').map(({ fields }) => fields);
    }

    it('a player sees the image items with the state of the token, and no layer group', () => {
      interaction.getState().allowLayerChoice(false);
      withPortrait({ flipX: true });
      openOn(LYRA_ID);

      expect(screen.getByRole('menuitem', { name: 'Imagem…' })).not.toBeNull();
      expect(screen.getByRole('menuitemcheckbox', { name: 'Borda redonda' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
      expect(
        screen.getByRole('menuitemcheckbox', { name: 'Inverter na horizontal' }),
      ).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('menuitemcheckbox', { name: 'Inverter na vertical' })).not.toBeNull();
      expect(screen.queryByRole('group', { name: 'Mover para camada' })).toBeNull();
    });

    it('"Borda redonda" restyles the token to a round frame', async () => {
      withPortrait();
      openOn(LYRA_ID);

      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Borda redonda' }));

      expect(restyled()).toEqual([{ tokenIds: [LYRA_ID], style: { frame: 'round' } }]);
    });

    it('with Lyra and Kael selected, "Inverter na horizontal" restyles both', async () => {
      withPortrait();
      interaction.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false });
      openOn(LYRA_ID);

      await userEvent.click(
        screen.getByRole('menuitemcheckbox', { name: 'Inverter na horizontal' }),
      );

      expect(restyled()).toEqual([{ tokenIds: [LYRA_ID, KAEL_ID], style: { flipX: true } }]);
    });

    it('without an image the frame and the flips wait for one, and say so', () => {
      openOn(LYRA_ID);

      const round = screen.getByRole('menuitemcheckbox', { name: 'Borda redonda' });
      expect(round).toHaveAttribute('aria-disabled', 'true');
      expect(round).toHaveAccessibleDescription('Ponha uma imagem primeiro.');
    });

    it('"Imagem…" asks for the image dialog of that token', async () => {
      openOn(KAEL_ID);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Imagem…' }));

      expect(imageOf).toEqual([KAEL_ID]);
    });

    it('a refused restyle says why on the status line', async () => {
      commands.answerWith({ ok: false, failure: 'forbidden' });
      withPortrait();
      openOn(LYRA_ID);

      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Borda redonda' }));
      await act(() => Promise.resolve());

      expect(interaction.getState().notice).toBe('recusado: forbidden');
    });
  });

  describe('"Tornar principal"', () => {
    function asBia(): void {
      const viewer = { userId: BIA_AT_TABLE.userId, role: 'player' as const };
      board
        .getState()
        .apply({ kind: 'board', state: vharnBoard({ viewer, tokens: [lyra(), kael()] }) });
    }

    it('Bia, in the control of Kael (not her main token), makes him main and the menu closes', async () => {
      asBia();
      openOn(KAEL_ID);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Tornar principal' }));

      expect(commands.sentAs('setMainToken').map(({ fields }) => fields)).toEqual([
        { tokenId: KAEL_ID },
      ]);
      expect(closed).toBe(1);
    });

    it('on her main token the item is not there', () => {
      asBia();
      openOn(LYRA_ID);

      expect(screen.queryByRole('menuitem', { name: 'Tornar principal' })).toBeNull();
    });

    it('the master on a token that does not list her in its control has no item', () => {
      openOn(KAEL_ID);

      expect(screen.queryByRole('menuitem', { name: 'Tornar principal' })).toBeNull();
    });

    it('a refusal says why on the status line', async () => {
      asBia();
      commands.answerWith({ ok: false, failure: 'forbidden' });
      openOn(KAEL_ID);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Tornar principal' }));
      await act(() => Promise.resolve());

      expect(interaction.getState().notice).toBe('recusado: forbidden');
    });
  });

  describe('"Tornar principal de" (master)', () => {
    const CAIO = CAIO_AT_TABLE.userId;

    // Caio chose his Kael; Bia has no choice, so her main token is Lyra, the oldest she controls.
    function withShared(): void {
      const shared = lyra({ controllerIds: [BIA_AT_TABLE.userId, CAIO] });
      const tokens = [shared, kael({ controllerIds: [CAIO] })];
      const mainTokens = [{ userId: CAIO, tokenId: KAEL_ID }];
      board.getState().apply({ kind: 'board', state: vharnBoard({ tokens, mainTokens }) });
    }

    async function openPlayers(): Promise<void> {
      await userEvent.click(screen.getByRole('menuitem', { name: 'Tornar principal de' }));
    }

    it('lists the players in the control of Lyra, Bia checked (Lyra is her main token)', async () => {
      withShared();
      openOn(LYRA_ID);

      await openPlayers();

      expect(screen.getByRole('menuitemcheckbox', { name: 'Bia' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(screen.getByRole('menuitemcheckbox', { name: 'Caio' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    });

    it('choosing Caio makes Lyra his main token and the menu closes', async () => {
      withShared();
      openOn(LYRA_ID);

      await openPlayers();
      await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Caio' }));

      expect(commands.sentAs('setMainToken').map(({ fields }) => fields)).toEqual([
        { tokenId: LYRA_ID, playerId: CAIO },
      ]);
      expect(closed).toBe(1);
    });

    it('a token nobody is listed on has no "Tornar principal de"', () => {
      board.getState().apply({
        kind: 'board',
        state: vharnBoard({ tokens: [lyra({ controllerIds: [] })] }),
      });
      openOn(LYRA_ID);

      expect(screen.queryByRole('menuitem', { name: 'Tornar principal de' })).toBeNull();
    });

    it('a player never gets it, even on a token shared with someone else', () => {
      const viewer = { userId: BIA_AT_TABLE.userId, role: 'player' as const };
      const shared = lyra({ controllerIds: [BIA_AT_TABLE.userId, CAIO] });
      board.getState().apply({ kind: 'board', state: vharnBoard({ viewer, tokens: [shared] }) });
      openOn(LYRA_ID);

      expect(screen.queryByRole('menuitem', { name: 'Tornar principal de' })).toBeNull();
    });
  });
});
