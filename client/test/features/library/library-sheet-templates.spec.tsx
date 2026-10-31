import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { VHARN } from '../../support/campaigns-api-fake';
import { replaceCode } from '../../support/code-editor-input';
import { DataTransferFake } from '../../support/data-transfer-fake';
import { ATO_1, CATACUMBAS, masterLibrary, playerLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { menuItemNames, openTreeMenu, treeItem, treeItemNames } from '../../support/library-tree';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import { NEW_TEMPLATE_ID, tormentaSummary } from '../../support/sheet-template-fixtures';

function withTormenta(folderId: string | null = null): TestDependencies {
  const deps = testDependencies();
  deps.libraryApi.answer('list', {
    ok: true,
    value: masterLibrary({ sheetTemplates: [tormentaSummary({ folderId })] }),
  });
  return deps;
}

async function openTormentaEditor(deps: TestDependencies) {
  const room = await openLibrary(deps);
  await userEvent.click(treeItem('Ficha Tormenta'));
  await screen.findByRole('textbox', { name: 'HTML do modelo' });
  return room;
}

describe('sheet templates in the library', () => {
  it('the master filters "Modelos de ficha": the template with its folders, marked as such', async () => {
    const deps = withTormenta(CATACUMBAS.id);
    await openLibrary(deps);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo de item' }),
      'sheet-template',
    );
    expect(treeItemNames()).toEqual(['Ato 1', 'Catacumbas', 'Ficha Tormenta']);
    expect(treeItem('Ficha Tormenta')).toHaveAccessibleDescription('Modelo de ficha · só mestres');
  });

  it('a player (Bia) has no "Modelos de ficha" filter', async () => {
    const deps = testDependencies();
    deps.libraryApi.answer('list', { ok: true, value: playerLibrary() });
    await openLibrary(deps, { role: 'player' });
    const types = screen.getByRole('combobox', { name: 'Tipo de item' });
    expect(within(types).queryByRole('option', { name: 'Modelos de ficha' })).toBeNull();
    expect(within(types).getByRole('option', { name: 'Documentos' })).toBeInTheDocument();
  });

  it('picking the template opens its editor with the code read from its route', async () => {
    const deps = withTormenta();
    await openTormentaEditor(deps);
    expect(screen.getByRole('region', { name: 'Editor do modelo' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome do modelo' })).toHaveValue('Ficha Tormenta');
    expect(treeItem('Ficha Tormenta')).toHaveAttribute('aria-selected', 'true');
  });

  it('"Novo modelo de ficha" creates it born with a commented example of the SDK, and picks it', async () => {
    const deps = withTormenta();
    await openLibrary(deps);
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({
        sheetTemplates: [
          tormentaSummary(),
          tormentaSummary({ id: NEW_TEMPLATE_ID, name: 'Modelo sem nome' }),
        ],
      }),
    });
    await userEvent.click(
      await within(await openTreeMenu(treeItem('Ato 1'))).findByRole('menuitem', {
        name: 'Novo modelo de ficha aqui',
      }),
    );
    await waitFor(() => expect(deps.sheetTemplatesApi.creates).toHaveLength(1));
    const { input } = deps.sheetTemplatesApi.creates[0] ?? { input: null };
    expect(input?.folderId).toBe(ATO_1.id);
    for (const call of ['ready()', 'onState(', 'values.set(', 'bars.adjust(', 'dice.roll('])
      expect(input?.js).toContain(`lorkarium.${call}`);
    expect(input?.js).toMatch(/^\/\/ /mu);
    expect(input?.html).toContain('<!--');
    expect(await screen.findByRole('textbox', { name: 'Nome do modelo' })).toHaveValue(
      'Modelo sem nome',
    );
  });

  it('deleting asks first and sends the delete; a template in use is refused in the status line', async () => {
    const deps = withTormenta();
    deps.sheetTemplatesApi.answer = { ok: false, failure: { kind: 'in_use' } };
    await openLibrary(deps);
    const menu = await openTreeMenu(treeItem('Ficha Tormenta'));
    expect(menuItemNames(menu)).toEqual(['Excluir modelo']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir modelo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText(/ligado a fichas/u)).toBeInTheDocument();
    expect(deps.sheetTemplatesApi.removals).toEqual([TORMENTA_TEMPLATE_ID]);
  });

  it('dragging the template onto a folder moves it against its version', async () => {
    const deps = withTormenta();
    await openLibrary(deps);
    const transfer = new DataTransferFake();
    fireEvent.dragStart(treeItem('Ficha Tormenta'), { dataTransfer: transfer });
    fireEvent.drop(treeItem('Ato 1'), { dataTransfer: transfer });
    await waitFor(() => expect(deps.sheetTemplatesApi.updates).toHaveLength(1));
    expect(deps.sheetTemplatesApi.updates[0]?.input).toEqual({
      expectedVersion: 3,
      folderId: ATO_1.id,
    });
  });

  it('picking another item with unsaved code asks first; "Continuar editando" stays', async () => {
    const deps = withTormenta();
    await openTormentaEditor(deps);
    replaceCode('HTML do modelo', '<p>novo</p>');
    await userEvent.click(treeItem('Cena 1'));
    expect(
      await screen.findByRole('alertdialog', { name: 'Descartar o código não salvo?' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(treeItem('Ficha Tormenta')).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(treeItem('Cena 1'));
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(treeItem('Cena 1')).toHaveAttribute('aria-selected', 'true'));
    expect(screen.queryByRole('region', { name: 'Editor do modelo' })).toBeNull();
  });

  it('Esc inside the code field belongs to the editor: the library stays open', async () => {
    const deps = withTormenta();
    const { router } = await openTormentaEditor(deps);
    screen.getByRole('textbox', { name: 'HTML do modelo' }).focus();
    await userEvent.keyboard('{Escape}');
    // Closing would navigate on a later task; give it the time it takes.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table/library`);
    expect(screen.getByRole('region', { name: 'Editor do modelo' })).toBeInTheDocument();
  });

  it('Esc in the full-screen preview leaves the full screen, and the library stays open', async () => {
    const deps = withTormenta();
    const { router } = await openTormentaEditor(deps);
    await userEvent.click(screen.getByRole('button', { name: 'Prévia em tela cheia' }));
    await userEvent.keyboard('{Escape}');
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table/library`);
    expect(screen.getByRole('button', { name: 'Prévia em tela cheia' })).toBeInTheDocument();
  });

  it('the divider is remembered in the person’s storage', async () => {
    const deps = withTormenta();
    await openTormentaEditor(deps);
    const divider = screen.getByRole('separator', { name: 'Dividir código e prévia' });
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    const stored = deps.sheetEditorLayoutStorage.values.get(
      'lorkarium.sheetEditor.layout.test-user',
    );
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ codeShare: 65 });
  });

  it('closing the library with unsaved code asks first', async () => {
    const deps = withTormenta();
    await openTormentaEditor(deps);
    replaceCode('HTML do modelo', '<p>novo</p>');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar biblioteca' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Descartar o código não salvo?' }),
    ).toBeInTheDocument();
  });
});
