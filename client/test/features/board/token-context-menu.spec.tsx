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
import { fireAura, goldAura } from '../../support/aura-fixtures';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  BIA_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  kael,
  lyra,
  vharnBoard,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const GOBLIN_ID = '7f6e5d4c-3b2a-4f1e-8d9c-0b1a2c3d4e5f';

describe('TokenContextMenu', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;
  let closed: number;
  let conditionTargets: Array<readonly string[]>;
  let imageOf: string[];
  let auraOf: string[];

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    const goblin = lyra({ id: GOBLIN_ID, name: 'Goblin', layer: 'objects' });
    board
      .getState()
      .apply({ kind: 'board', state: vharnBoard({ tokens: [lyra(), kael(), goblin] }) });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
    interaction.getState().allowLayerChoice(true);
    closed = 0;
    conditionTargets = [];
    imageOf = [];
    auraOf = [];
  });

  function openOn(tokenId: string): void {
    const request: TokenMenuRequest = { tokenId, x: 120, y: 80 };
    render(
      <TokenContextMenu
        request={request}
        board={board}
        interaction={interaction}
        onApplyCondition={(tokenIds) => conditionTargets.push(tokenIds)}
        onChangeImage={(tokenId) => imageOf.push(tokenId)}
        onChangeAura={(tokenId) => auraOf.push(tokenId)}
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

  // The main token is now only the token of one's character: nobody chooses it.
  it('Bia, in the control of Kael, is offered no "Tornar principal"', () => {
    const viewer = { userId: BIA_AT_TABLE.userId, role: 'player' as const };
    board
      .getState()
      .apply({ kind: 'board', state: vharnBoard({ viewer, tokens: [lyra(), kael()] }) });
    openOn(KAEL_ID);
    expect(screen.queryByRole('menuitem', { name: /Tornar principal/ })).toBeNull();
  });

  describe('"Tornar invisível" / "Tornar visível" (master)', () => {
    const invisible = () => screen.queryByRole('menuitem', { name: 'Tornar invisível' });
    const visible = () => screen.queryByRole('menuitem', { name: 'Tornar visível' });

    function withTokens(...tokens: ReturnType<typeof lyra>[]): void {
      board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
    }

    it('the master with Lyra and Kael selected hides both, in one command', async () => {
      interaction.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false });
      openOn(KAEL_ID);

      expect(visible()).toBeNull();
      await userEvent.click(screen.getByRole('menuitem', { name: 'Tornar invisível' }));

      expect(commands.sentAs('setTokensHidden').map(({ fields }) => fields)).toEqual([
        { tokenIds: [LYRA_ID, KAEL_ID], hidden: true },
      ]);
      expect(closed).toBe(1);
    });

    it('with one hidden and one visible selected, both items show; "Tornar visível" shows the hidden one', async () => {
      withTokens(lyra({ hidden: true }), kael());
      interaction.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false });
      openOn(LYRA_ID);

      expect(invisible()).not.toBeNull();
      await userEvent.click(screen.getByRole('menuitem', { name: 'Tornar visível' }));

      expect(commands.sentAs('setTokensHidden').map(({ fields }) => fields)).toEqual([
        { tokenIds: [LYRA_ID], hidden: false },
      ]);
    });

    it('on a token outside the selection, only that one is hidden', async () => {
      interaction.getState().selectMany([LYRA_ID], { additive: false });
      openOn(KAEL_ID);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Tornar invisível' }));

      expect(commands.sentAs('setTokensHidden').map(({ fields }) => fields)).toEqual([
        { tokenIds: [KAEL_ID], hidden: true },
      ]);
    });

    it('Bia, a player in the control of Lyra, has neither item', () => {
      const viewer = { userId: BIA_AT_TABLE.userId, role: 'player' as const };
      board.getState().apply({ kind: 'board', state: vharnBoard({ viewer, tokens: [lyra()] }) });
      interaction.getState().allowLayerChoice(false);
      openOn(LYRA_ID);

      expect(invisible()).toBeNull();
      expect(visible()).toBeNull();
    });
  });

  describe('"Aura…", for whoever controls the token', () => {
    function withTokens(...tokens: ReturnType<typeof lyra>[]): void {
      board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
    }

    it('Bia on her Lyra has "Aura…", and it asks for the aura dialog of Lyra alone', async () => {
      interaction.getState().allowLayerChoice(false);
      withTokens(lyra({ canControl: true }), kael());
      interaction.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false });
      openOn(LYRA_ID);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Aura…' }));

      expect(auraOf).toEqual([LYRA_ID]);
    });

    it('Caio on the Lyra of Bia, which he does not control, has no "Aura…"', () => {
      interaction.getState().allowLayerChoice(false);
      withTokens(lyra({ canControl: false }));
      openOn(LYRA_ID);

      expect(screen.queryByRole('menuitem', { name: 'Aura…' })).toBeNull();
    });

    it('the master has "Aura…" on a goblin of the objects layer', () => {
      openOn(GOBLIN_ID);

      expect(screen.getByRole('menuitem', { name: 'Aura…' })).toBeInTheDocument();
    });
  });

  describe('"Tirar aura", at once', () => {
    function withTokens(...tokens: ReturnType<typeof lyra>[]): void {
      board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
    }

    function restyled(): unknown[] {
      return commands.sentAs('restyleTokens').map(({ fields }) => fields);
    }

    it('Bia on her Lyra with a fire aura takes it away with no dialog', async () => {
      withTokens(lyra({ canControl: true, aura: fireAura() }));
      openOn(LYRA_ID);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Tirar aura' }));

      expect(restyled()).toEqual([{ tokenIds: [LYRA_ID], style: { aura: null } }]);
      expect(auraOf).toEqual([]);
    });

    it('with Lyra and Kael selected, both with an aura, it takes both away in one restyle', async () => {
      withTokens(lyra({ aura: fireAura() }), kael({ aura: goldAura() }));
      interaction.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false });
      openOn(LYRA_ID);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Tirar aura' }));

      expect(restyled()).toEqual([{ tokenIds: [LYRA_ID, KAEL_ID], style: { aura: null } }]);
    });

    it('a selected token without an aura, or not controlled, is left out', async () => {
      const goblin = lyra({ id: GOBLIN_ID, name: 'Goblin', aura: goldAura(), canControl: false });
      withTokens(lyra({ aura: fireAura() }), kael(), goblin);
      interaction.getState().selectMany([LYRA_ID, KAEL_ID, GOBLIN_ID], { additive: false });
      openOn(LYRA_ID);

      await userEvent.click(screen.getByRole('menuitem', { name: 'Tirar aura' }));

      expect(restyled()).toEqual([{ tokenIds: [LYRA_ID], style: { aura: null } }]);
    });

    it('a token without an aura has no "Tirar aura"', () => {
      withTokens(lyra({ aura: null }));
      openOn(LYRA_ID);

      expect(screen.queryByRole('menuitem', { name: 'Tirar aura' })).toBeNull();
    });

    it('Caio on the Lyra of Bia, which he does not control, has no "Tirar aura"', () => {
      withTokens(lyra({ canControl: false, aura: fireAura() }));
      openOn(LYRA_ID);

      expect(screen.queryByRole('menuitem', { name: 'Tirar aura' })).toBeNull();
    });
  });
});
