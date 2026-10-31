import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { testDependencies } from '../../support/app-dependencies';
import { ATO_1, CATACUMBAS, PORTRAIT, masterLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { openTreeMenu, treeItem, treeItemNames, menuItemNames } from '../../support/library-tree';
import { DataTransferFake } from '../../support/data-transfer-fake';
import { documentFixture } from '../../support/documents-fixtures';

describe('mixed library browser', () => {
  it('document filter preserves its ancestors and distinguishes the item from grids and images', async () => {
    const deps = testDependencies();
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({
        images: [PORTRAIT],
        documents: [documentFixture({ name: 'Visão dos deuses', folderId: CATACUMBAS.id })],
      }),
    });
    await openLibrary(deps);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo de item' }),
      'document',
    );
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar item' }), 'visao');
    expect(treeItemNames()).toEqual(['Ato 1', 'Catacumbas', 'Visão dos deuses']);
    expect(treeItem('Visão dos deuses')).toHaveAccessibleDescription('Documento · Privado');
  });
  it('refused document movement restores the confirmed folder and sends the versioned document command', async () => {
    const deps = testDependencies();
    deps.documentsApi.updateResult = { ok: false, failure: { kind: 'conflict' } };
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({ documents: [documentFixture({ version: 4 })] }),
    });
    await openLibrary(deps);
    const transfer = new DataTransferFake();
    fireEvent.dragStart(treeItem('Carta'), { dataTransfer: transfer });
    fireEvent.drop(treeItem('Ato 1'), { dataTransfer: transfer });
    await screen.findByText('O documento mudou. Confira a versão atual antes de tentar novamente.');
    expect(deps.documentsApi.updates).toEqual([
      { actionId: expect.any(String), expectedVersion: 4, folderId: ATO_1.id },
    ]);
    expect(
      within(treeItem('Sem pasta')).getByRole('treeitem', { name: 'Carta' }),
    ).toBeInTheDocument();
    expect(deps.libraryApi.callsOf('updateImage')).toEqual([]);
    expect(deps.libraryApi.callsOf('updateScene')).toEqual([]);
  });
  it('type filter alone prunes folders without matching images and opens the retained ancestors', async () => {
    const deps = testDependencies();
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({ images: [{ ...PORTRAIT, folderId: CATACUMBAS.id }] }),
    });
    await openLibrary(deps);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo de item' }), 'image');
    expect(treeItemNames()).toEqual(['Ato 1', 'Catacumbas', 'Retrato']);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo de item' }), 'grid');
    expect(screen.queryByRole('treeitem', { name: 'Retrato' })).not.toBeInTheDocument();
    expect(treeItem('Cena 1')).toBeInTheDocument();
  });
  it('grids and images share folders and count while selecting an image shows only image actions', async () => {
    const deps = testDependencies();
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({ images: [{ ...PORTRAIT, folderId: ATO_1.id }] }),
    });
    await openLibrary(deps);
    expect(treeItem('Ato 1')).toHaveAccessibleDescription('4 itens');
    await userEvent.click(treeItem('Ato 1'));
    await userEvent.click(treeItem('Retrato'));
    expect(treeItem('Retrato')).toHaveAccessibleDescription('Imagem · Privado');
    expect(screen.getByRole('region', { name: 'Imagem escolhida' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicar' })).not.toBeInTheDocument();
    expect(menuItemNames(await openTreeMenu(treeItem('Retrato')))).toEqual([
      'Renomear',
      'Excluir imagem',
    ]);
  });
  it('image type combines accent-insensitive search and visibility and removes unrelated folders', async () => {
    const deps = testDependencies();
    const image = {
      ...PORTRAIT,
      name: 'Visão',
      visibility: 'public' as const,
      folderId: CATACUMBAS.id,
    };
    deps.libraryApi.answer('list', { ok: true, value: masterLibrary({ images: [image] }) });
    await openLibrary(deps);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo de item' }), 'image');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar item' }), 'visao');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Visibilidade' }), 'public');
    expect(treeItemNames()).toEqual(['Ato 1', 'Catacumbas', 'Visão']);
  });
  it('image drop sends an image update and refusal restores its confirmed folder', async () => {
    const deps = testDependencies();
    deps.libraryApi.answer('list', { ok: true, value: masterLibrary({ images: [PORTRAIT] }) });
    const release = deps.libraryApi.hold('updateImage');
    await openLibrary(deps);
    const transfer = new DataTransferFake();
    fireEvent.dragStart(treeItem('Retrato'), { dataTransfer: transfer });
    fireEvent.drop(treeItem('Ato 1'), { dataTransfer: transfer });
    await waitFor(() =>
      expect(deps.libraryApi.callsOf('updateImage')).toEqual([
        [PORTRAIT.id, { folderId: ATO_1.id }],
      ]),
    );
    release({ ok: false, failure: { kind: 'forbidden' } });
    await screen.findByText('Só o mestre mexe na biblioteca.');
    expect(
      within(treeItem('Sem pasta')).getByRole('treeitem', { name: 'Retrato' }),
    ).toBeInTheDocument();
    expect(deps.libraryApi.callsOf('updateScene')).toEqual([]);
  });
});
