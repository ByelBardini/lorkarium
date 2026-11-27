import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SavedTokensPanel } from '@/features/saved-tokens/saved-tokens-panel';
import { SAVED_TOKEN_DRAG_TYPE } from '@/lib/saved-token-drag';
import { createSavedTokensStore } from '@/stores/saved-tokens-store';
import { createSpawnAimStore } from '@/stores/spawn-aim-flow';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  MORTOS_ID,
  SKELETON_ID,
  ZOMBIE_ID,
  skeletonSaved,
  zombieSaved,
} from '../../support/saved-token-fixtures';
import { SavedTokensApiFake } from '../../support/saved-tokens-api-fake';

const MORTOS = { id: MORTOS_ID, name: 'Mortos-vivos' };

function setup(
  options: Partial<{ canSpawn: boolean; watchesOnly: boolean; api: SavedTokensApiFake }> = {},
) {
  const api = options.api ?? new SavedTokensApiFake([zombieSaved(), skeletonSaved()], [MORTOS]);
  const list = createSavedTokensStore(api, VHARN.id);
  const aim = createSpawnAimStore();
  render(
    <SavedTokensPanel
      list={list}
      aim={aim}
      canSpawn={options.canSpawn ?? true}
      watchesOnly={options.watchesOnly ?? false}
    />,
  );
  return { api, list, aim, user: userEvent.setup() };
}

describe('SavedTokensPanel', () => {
  it('lists the saved tokens by folder: the Esqueleto under Mortos-vivos, the Zumbi out of any', async () => {
    setup();

    const folder = await screen.findByRole('group', { name: 'Mortos-vivos' });
    const loose = screen.getByRole('group', { name: 'Sem pasta' });

    expect(
      within(folder).getByRole('button', { name: 'Pôr Esqueleto no mapa' }),
    ).toBeInTheDocument();
    expect(within(loose).getByRole('button', { name: 'Pôr Zumbi no mapa' })).toBeInTheDocument();
  });

  it('a click on the Zumbi arms it: pressed, and the hint says how to place and stop', async () => {
    const { aim, user } = setup();

    await user.click(await screen.findByRole('button', { name: 'Pôr Zumbi no mapa' }));

    expect(aim.getState().armed?.id).toBe(ZOMBIE_ID);
    expect(screen.getByRole('button', { name: 'Pôr Zumbi no mapa' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Clique no mapa para pôr Zumbi · Esc para parar')).toBeInTheDocument();
  });

  it('"Parar" disarms it', async () => {
    const { aim, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Pôr Zumbi no mapa' }));

    await user.click(screen.getByRole('button', { name: 'Parar' }));

    expect(aim.getState().armed).toBeNull();
  });

  it('without the right to create tokens the entry does not arm and says why', async () => {
    const { aim } = setup({ canSpawn: false });

    const entry = await screen.findByRole('button', { name: 'Pôr Zumbi no mapa' });

    expect(entry).toBeDisabled();
    expect(screen.getByText('O mestre não liberou criar tokens nesta mesa.')).toBeInTheDocument();
    expect(aim.getState().armed).toBeNull();
  });

  it('the search keeps only the names that match, ignoring case', async () => {
    const { user } = setup();
    await screen.findByRole('button', { name: 'Pôr Zumbi no mapa' });

    await user.type(screen.getByRole('searchbox', { name: 'Buscar token salvo' }), 'esq');

    expect(screen.queryByRole('button', { name: 'Pôr Zumbi no mapa' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pôr Esqueleto no mapa' })).toBeInTheDocument();
  });

  it('"Excluir" in the entry’s menu asks first and then deletes it', async () => {
    const { api, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Ações de Zumbi' }));

    await user.click(screen.getByRole('menuitem', { name: 'Excluir…' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Pôr Zumbi no mapa' })).not.toBeInTheDocument(),
    );
    expect(api.calls).toContain(`remove:${ZOMBIE_ID}`);
  });

  it('"Renomear…" saves the new name of the entry', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Ações de Zumbi' }));

    await user.click(screen.getByRole('menuitem', { name: 'Renomear…' }));
    const field = screen.getByRole('textbox', { name: 'Nome do token salvo' });
    await user.clear(field);
    await user.type(field, 'Zumbi velho{Enter}');

    expect(
      await screen.findByRole('button', { name: 'Pôr Zumbi velho no mapa' }),
    ).toBeInTheDocument();
  });

  it('an empty list says how to save the first one', async () => {
    setup({ api: new SavedTokensApiFake([]) });

    expect(await screen.findByText(/Nenhum token salvo/)).toBeInTheDocument();
  });

  it('a spectator gets the sentence and no list', () => {
    setup({ watchesOnly: true });

    expect(screen.getByText('Quem assiste à mesa não guarda tokens.')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('an entry locked by the plan shows the lock and still arms', async () => {
    const api = new SavedTokensApiFake([zombieSaved({ planLocked: true })]);
    const { aim, user } = setup({ api });

    await user.click(await screen.findByRole('button', { name: 'Pôr Zumbi no mapa' }));

    expect(screen.getByLabelText('Só leitura pelo plano')).toBeInTheDocument();
    expect(aim.getState().armed?.id).toBe(ZOMBIE_ID);
  });

  it('dragging the Zumbi carries its id under the saved token type', async () => {
    setup();
    const entry = await screen.findByRole('button', { name: 'Pôr Zumbi no mapa' });
    const carried = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => carried.set(type, value),
      effectAllowed: 'none',
    };

    fireEvent.dragStart(entry, { dataTransfer });

    expect(entry).toHaveAttribute('draggable', 'true');
    expect(carried.get(SAVED_TOKEN_DRAG_TYPE)).toBe(ZOMBIE_ID);
    expect(dataTransfer.effectAllowed).toBe('copyMove');
  });

  it('without the right to create tokens the entry is not draggable', async () => {
    setup({ canSpawn: false });

    const entry = await screen.findByRole('button', { name: 'Pôr Zumbi no mapa' });

    expect(entry).toHaveAttribute('draggable', 'false');
  });

  it('a click on the folder header folds it: its tokens hide, the count stays', async () => {
    const { user } = setup();
    const header = await screen.findByRole('button', { name: 'Pasta Mortos-vivos' });

    await user.click(header);

    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(header).toHaveTextContent('1');
    expect(screen.queryByRole('button', { name: 'Pôr Esqueleto no mapa' })).not.toBeInTheDocument();
  });

  it('dropping the Zumbi on the Mortos-vivos folder moves it there', async () => {
    const { api } = setup();
    const folder = await screen.findByRole('group', { name: 'Mortos-vivos' });
    const dataTransfer = dragOf(ZOMBIE_ID);

    fireEvent.dragOver(folder, { dataTransfer });
    fireEvent.drop(folder, { dataTransfer });

    await waitFor(() =>
      expect(
        within(screen.getByRole('group', { name: 'Mortos-vivos' })).getByRole('button', {
          name: 'Pôr Zumbi no mapa',
        }),
      ).toBeInTheDocument(),
    );
    expect(api.calls).toContain(`update:${ZOMBIE_ID}`);
  });

  it('dropping the Esqueleto on "Sem pasta" takes it out of its folder', async () => {
    const { api } = setup();
    await screen.findByRole('group', { name: 'Mortos-vivos' });

    fireEvent.drop(screen.getByRole('group', { name: 'Sem pasta' }), {
      dataTransfer: dragOf(SKELETON_ID),
    });

    await waitFor(() =>
      expect(api.savedTokens.find(({ id }) => id === SKELETON_ID)?.folderId).toBeNull(),
    );
  });

  it('a drag that enters the folder takes the drop at once, before any dragover', async () => {
    setup();
    await screen.findByRole('group', { name: 'Mortos-vivos' });
    const folder = screen.getByRole('group', { name: 'Mortos-vivos' });

    const accepted = fireEvent.dragEnter(folder, { dataTransfer: dragOf(ZOMBIE_ID) });

    expect(accepted).toBe(false);
  });

  it('a drop on the folder it is already in sends nothing', async () => {
    const { api } = setup();
    const folder = await screen.findByRole('group', { name: 'Mortos-vivos' });

    fireEvent.drop(folder, { dataTransfer: dragOf(SKELETON_ID) });

    expect(api.calls.filter((call) => call.startsWith('update:'))).toEqual([]);
  });
});

function dragOf(savedTokenId: string) {
  return {
    types: [SAVED_TOKEN_DRAG_TYPE],
    getData: (type: string) => (type === SAVED_TOKEN_DRAG_TYPE ? savedTokenId : ''),
    dropEffect: 'none',
  };
}
