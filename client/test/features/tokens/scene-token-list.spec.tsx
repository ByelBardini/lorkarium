import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { SceneTokenList } from '@/features/tokens/scene-token-list';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  LYRA_ID,
  groupDraggedOver,
  lyra,
  vharnBoard,
  vharnState,
  BIA_AT_TABLE,
  VHARN_SCENE,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const KAEL_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const PORTRAIT_ID = '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

describe('SceneTokenList', () => {
  let board: StoreApi<BoardStore>;
  let presence: StoreApi<TablePresenceStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    presence = createTablePresenceStore(VHARN.id);
    presence.getState().apply({ kind: 'state', state: vharnState() });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
  });

  function renderList(tokens = [lyra()], isMaster = true): void {
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
    render(
      <SceneTokenList
        board={board}
        presence={presence}
        interaction={interaction}
        isMaster={isMaster}
      />,
    );
  }

  function row(name: string): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(`^${name}`) });
  }

  it('lists the scene by side and by name, with who plays each and the first bar', () => {
    const kael = lyra({ id: KAEL_ID, name: 'Kael', controllerIds: [] });
    renderList([lyra(), kael]);

    expect(screen.getByRole('heading', { name: 'Grupo · 2' })).toBeInTheDocument();
    const grupo = within(screen.getByRole('list', { name: 'Grupo · 2' }));
    expect(grupo.getAllByRole('button').map((button) => button.textContent)).toEqual([
      expect.stringContaining('Kael'),
      expect.stringContaining('Lyra'),
    ]);
    expect(row('Lyra')).toHaveTextContent('jogado por Bia');
    expect(row('Kael')).toHaveTextContent('NPC');
    expect(screen.getByRole('meter', { name: 'PV de Lyra' })).toHaveAttribute(
      'aria-valuetext',
      '32 / 45',
    );
  });

  it('the sides come as "Grupo", "Inimigos" and "Neutros", each with how many it has', () => {
    renderList([
      lyra(),
      lyra({ id: 'g', name: 'Goblin', side: 'enemy' }),
      lyra({ id: 'o', name: 'Ogro', side: 'enemy' }),
      lyra({ id: 't', name: 'Taverneiro', side: 'neutral' }),
    ]);

    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'Grupo · 1',
      'Inimigos · 2',
      'Neutros · 1',
    ]);
  });

  it('the same enemy creature is folded in one group ("Bandido ×6"), and opening it lists them', async () => {
    const bandits = [1, 2, 3, 4, 5, 6].map((n) =>
      lyra({ id: `b-${n}`, name: `Bandido ${n}`, side: 'enemy' }),
    );
    renderList(bandits);
    const group = screen.getByRole('button', { name: /^Bandido×6/ });
    expect(group).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(group);

    const members = screen.getByRole('list', { name: 'Tokens de Bandido' });
    expect(within(members).getAllByRole('listitem')).toHaveLength(6);
  });

  it('a group holding the selected token opens by itself', () => {
    const bandits = [1, 2].map((n) => lyra({ id: `b-${n}`, name: `Bandido ${n}`, side: 'enemy' }));
    renderList(bandits);

    act(() => interaction.getState().select('b-2'));

    expect(screen.getByRole('button', { name: /^Bandido×2/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('the chest of the Objetos layer and the rug of Fundo are not in the list, and the Goblin is', () => {
    renderList([
      lyra({ id: 'goblin', name: 'Goblin' }),
      lyra({ id: 'bau', name: 'Baú', layer: 'objects' }),
      lyra({ id: 'tapete', name: 'Tapete', layer: 'background' }),
    ]);

    const list = screen.getByRole('list', { name: 'Na cena' });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(list).toHaveTextContent('Goblin');
  });

  it('a token without image shows its initials in the row', () => {
    renderList();
    expect(row('Lyra').querySelector('img')).toBeNull();
    expect(row('Lyra')).toHaveTextContent(lyra().initials);
  });

  it('a token with image shows it in the row instead of the initials, in its round frame', () => {
    renderList([lyra({ imageAssetId: PORTRAIT_ID, frame: 'round' })]);
    const portrait = row('Lyra').querySelector('img');
    expect(portrait).toHaveAttribute('src', `/api/assets/${PORTRAIT_ID}`);
    expect(portrait).toHaveClass('rounded-full');
    expect(row('Lyra')).not.toHaveTextContent(lyra().initials);
  });

  it('an image that fails to load falls back to the initials', () => {
    renderList([lyra({ imageAssetId: PORTRAIT_ID })]);
    const portrait = row('Lyra').querySelector('img');
    expect(portrait).not.toHaveClass('rounded-full');
    fireEvent.error(portrait as HTMLImageElement);
    expect(row('Lyra').querySelector('img')).toBeNull();
    expect(row('Lyra')).toHaveTextContent(lyra().initials);
  });

  it('clicking a row selects the token on the board and marks it; no card opens in the list', async () => {
    renderList();

    await userEvent.click(row('Lyra'));

    expect(interaction.getState().selectedTokenIds).toEqual([LYRA_ID]);
    expect(row('Lyra')).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('list', { name: 'Na cena' })).queryByRole('region')).toBeNull();
  });

  it('clicking the selected row again clears the selection', async () => {
    renderList();
    act(() => interaction.getState().select(LYRA_ID));

    await userEvent.click(row('Lyra'));

    expect(interaction.getState().selectedTokenIds).toEqual([]);
  });

  it('selecting on the board marks the row', () => {
    renderList();
    act(() => interaction.getState().select(LYRA_ID));
    expect(row('Lyra')).toHaveAttribute('aria-pressed', 'true');
  });

  it('two selected mark both rows and say "2 selecionados"', () => {
    renderList([lyra(), lyra({ id: KAEL_ID, name: 'Kael' })]);
    act(() => interaction.getState().selectMany([LYRA_ID, KAEL_ID], { additive: false }));
    const marked = screen.getAllByRole('button', { pressed: true });
    expect(marked.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Kael'),
      expect.stringContaining('Lyra'),
    ]);
    expect(screen.getByText('2 selecionados')).not.toBeNull();
  });

  it('one selected says no count', () => {
    renderList([lyra(), lyra({ id: KAEL_ID, name: 'Kael' })]);
    act(() => interaction.getState().select(LYRA_ID));
    expect(screen.queryByText(/selecionados$/)).toBeNull();
  });

  it('an empty scene tells the master how to add a token', () => {
    renderList([]);
    expect(screen.getByText('Crie um token pelo + na barra de ferramentas.')).toBeInTheDocument();
  });

  it('an empty scene for a player says the master has not placed anyone', () => {
    renderList([], false);
    expect(screen.getByText('O mestre ainda não pôs ninguém na cena.')).toBeInTheDocument();
  });
});

describe('SceneTokenList through the sight of Bia', () => {
  it('the list of Bia in the dark leaves out the ogre at 5 cells, even as a silhouette', () => {
    const board = createBoardStore(VHARN.id, () => undefined);
    const presence = createTablePresenceStore(VHARN.id);
    presence.getState().apply({ kind: 'state', state: vharnState() });
    const interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    const ogre = lyra({
      id: KAEL_ID,
      name: 'Ogro',
      col: 8,
      row: 4,
      canControl: false,
      controllerIds: [],
    });
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({
        viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
        scene: { ...VHARN_SCENE, vision: 'dark' },
        tokens: [lyra({ sight: { bright: 3, dim: 3 } }), ogre],
      }),
    });

    render(
      <SceneTokenList
        board={board}
        presence={presence}
        interaction={interaction}
        isMaster={false}
      />,
    );

    const items = within(screen.getByRole('list', { name: 'Na cena' })).getAllByRole('button');
    expect(items.map((item) => item.textContent)).toEqual([expect.stringContaining('Lyra')]);
  });
});

describe('SceneTokenList while a torch is dragged', () => {
  // Bia in the dark: Lyra (hers) at (3, 4), without darkvision, carries a lit torch of 3 + 3
  // cells; the ogre at (11, 4) is hidden from there, a silhouette from (6, 4), seen from (9, 4).
  const ALONE = {
    members: [{ tokenId: LYRA_ID, col: 3, row: 4, width: 1, height: 1 }],
    scene: { widthCells: VHARN_SCENE.widthCells, heightCells: VHARN_SCENE.heightCells },
  };
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    const presence = createTablePresenceStore(VHARN.id);
    presence.getState().apply({ kind: 'state', state: vharnState() });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
    const torch = { light: { bright: 3, dim: 3, color: null, angle: 360 }, lightLit: true };
    const ogre = lyra({ id: KAEL_ID, name: 'Ogro', col: 11, row: 4, canControl: false });
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({
        viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
        scene: { ...VHARN_SCENE, vision: 'dark' },
        tokens: [lyra({ sight: null, ...torch }), { ...ogre, controllerIds: [] }],
      }),
    });
    render(
      <SceneTokenList
        board={board}
        presence={presence}
        interaction={interaction}
        isMaster={false}
      />,
    );
  });

  function listed(): string[] {
    const list = within(screen.getByRole('list', { name: 'Na cena' }));
    return list.getAllByRole('button').map((button) => button.textContent ?? '');
  }

  function dragLyraTo(col: number): void {
    act(() => interaction.getState().dragOver(LYRA_ID, cell(3, 4), cell(col, 4), ALONE));
  }

  it('dragging Lyra to (6, 4) keeps only Lyra, and to (9, 4) shows the ogre before dropping', () => {
    dragLyraTo(6);
    expect(listed()).toEqual([expect.stringContaining('Lyra')]);

    dragLyraTo(9);
    expect(listed()).toEqual([expect.stringContaining('Lyra'), expect.stringContaining('Ogro')]);
  });

  it('Esc after dragging to (9, 4) leaves only Lyra again', () => {
    dragLyraTo(9);
    act(() => interaction.getState().cancelDrag());

    expect(listed()).toEqual([expect.stringContaining('Lyra')]);
  });

  it('dropped at (9, 4), the ogre stays while the server answers and goes when it refuses', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    commands.hold();
    dragLyraTo(9);
    act(() => void interaction.getState().dropToken(LYRA_ID, cell(9, 4)));
    expect(listed()).toEqual([expect.stringContaining('Lyra'), expect.stringContaining('Ogro')]);

    await act(async () => commands.release());

    expect(listed()).toEqual([expect.stringContaining('Lyra')]);
    expect(interaction.getState().notice).toBe('recusado: forbidden');
  });

  it('the master dragging Lyra to (9, 4) shows the ogre to Bia, and the end of the drag hides him', () => {
    const masterDrags = (to: { col: number; row: number } | null) =>
      act(() =>
        board.getState().apply({
          kind: 'tokensDragged',
          drag: groupDraggedOver([{ tokenId: LYRA_ID, cell: to }]),
        }),
      );

    masterDrags({ col: 9, row: 4 });
    expect(listed()).toEqual([expect.stringContaining('Lyra'), expect.stringContaining('Ogro')]);

    masterDrags(null);
    expect(listed()).toEqual([expect.stringContaining('Lyra')]);
  });
});

describe('SceneTokenList while Lyra turns', () => {
  // Bia in the dark: Lyra (hers) at (6, 4) looks right in a field of 90° with darkvision 6; the
  // ogre at (2, 4) is behind her.
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    const presence = createTablePresenceStore(VHARN.id);
    presence.getState().apply({ kind: 'state', state: vharnState() });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
    const ogre = lyra({ id: KAEL_ID, name: 'Ogro', col: 2, row: 4, canControl: false });
    const narrow = { col: 6, sight: { bright: 6, dim: 0 }, sightAngle: 90 };
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({
        viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
        scene: { ...VHARN_SCENE, vision: 'dark' },
        tokens: [lyra(narrow), { ...ogre, controllerIds: [] }],
      }),
    });
    render(
      <SceneTokenList
        board={board}
        presence={presence}
        interaction={interaction}
        isMaster={false}
      />,
    );
  });

  function listed(): string[] {
    const list = within(screen.getByRole('list', { name: 'Na cena' }));
    return list.getAllByRole('button').map((button) => button.textContent ?? '');
  }

  it('Bia turning Lyra around shows the ogre before the ack, and a refusal hides him again', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    commands.hold();
    expect(listed()).toEqual([expect.stringContaining('Lyra')]);

    act(() => void interaction.getState().faceTokens([{ tokenId: LYRA_ID, from: 0, to: 180 }]));
    expect(listed()).toEqual([expect.stringContaining('Lyra'), expect.stringContaining('Ogro')]);

    await act(async () => commands.release());
    expect(listed()).toEqual([expect.stringContaining('Lyra')]);
  });
});
