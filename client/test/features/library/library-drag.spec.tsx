import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { DataTransferFake } from '../../support/data-transfer-fake';
import { ATO_1, LUGARES_FIXOS, OSSUARIO, playerLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { openCatacumbas, treeItem, treeItemNames } from '../../support/library-tree';

describe('dragging in the library', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function drag(source: HTMLElement, target: HTMLElement): void {
    const dataTransfer = new DataTransferFake();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragEnter(target, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
  }

  it('dropping the Ossuário item on "Lugares fixos" moves it there', async () => {
    await openLibrary(deps);
    await openCatacumbas();
    drag(treeItem('Ossuário'), treeItem('Lugares fixos'));
    await waitFor(() =>
      expect(deps.libraryApi.callsOf('updateScene')).toEqual([
        [OSSUARIO.id, { folderId: LUGARES_FIXOS.id }],
      ]),
    );
  });

  it('dropping on "Sem pasta" takes the grid out of its folder', async () => {
    await openLibrary(deps);
    await openCatacumbas();
    drag(treeItem('Ossuário'), treeItem('Sem pasta'));
    await waitFor(() =>
      expect(deps.libraryApi.callsOf('updateScene')).toEqual([[OSSUARIO.id, { folderId: null }]]),
    );
  });

  it('dropping on another grid lands in the folder of that grid', async () => {
    await openLibrary(deps);
    await openCatacumbas();
    drag(treeItem('Ossuário'), treeItem('Cena 1'));
    await waitFor(() =>
      expect(deps.libraryApi.callsOf('updateScene')).toEqual([[OSSUARIO.id, { folderId: null }]]),
    );
  });

  it('a folder dropped on another goes inside it', async () => {
    await openLibrary(deps);
    drag(treeItem('Lugares fixos'), treeItem('Ato 1'));
    await waitFor(() =>
      expect(deps.libraryApi.callsOf('updateFolder')).toEqual([
        [LUGARES_FIXOS.id, { parentId: ATO_1.id }],
      ]),
    );
  });

  it('a folder over a folder inside it is marked as no drop, and dropping sends nothing', async () => {
    await openLibrary(deps);
    await userEvent.click(treeItem('Ato 1'));
    const dataTransfer = new DataTransferFake();
    fireEvent.dragStart(treeItem('Ato 1'), { dataTransfer });
    const catacumbas = treeItem('Catacumbas');
    expect(catacumbas).toHaveAttribute('aria-dropeffect', 'none');
    expect(treeItem('Lugares fixos')).toHaveAttribute('aria-dropeffect', 'move');
    expect(treeItem('Estrada de Vharn')).not.toHaveAttribute('aria-dropeffect');
    fireEvent.dragOver(catacumbas, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('none');
    fireEvent.drop(catacumbas, { dataTransfer });
    fireEvent.dragEnd(treeItem('Ato 1'), { dataTransfer });
    await act(() => Promise.resolve());
    expect(deps.libraryApi.callsOf('updateFolder')).toEqual([]);
    expect(catacumbas).not.toHaveAttribute('aria-dropeffect');
  });

  it('dropping where the grid already is sends nothing', async () => {
    await openLibrary(deps);
    await userEvent.click(treeItem('Ato 1'));
    drag(treeItem('Estrada de Vharn'), treeItem('Ato 1'));
    await act(() => Promise.resolve());
    expect(deps.libraryApi.callsOf('updateScene')).toEqual([]);
  });

  it('the grid moves at once, and a refusal puts it back in its folder with the reason', async () => {
    await openLibrary(deps);
    await openCatacumbas();
    const answer = deps.libraryApi.hold('updateScene');
    drag(treeItem('Ossuário'), treeItem('Lugares fixos'));
    await waitFor(() => expect(treeItemNames()).not.toContain('Ossuário'));
    expect(treeItem('Lugares fixos')).toHaveAccessibleDescription('1 item');
    answer({ ok: false, failure: { kind: 'folder_not_found' } });
    await waitFor(() => expect(treeItemNames()).toContain('Ossuário'));
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(
      'Essa pasta não existe mais.',
    );
  });

  it('nothing drags for a player', async () => {
    deps.libraryApi.answer('list', { ok: true, value: playerLibrary() });
    await openLibrary(deps, { role: 'player' });
    await userEvent.click(treeItem('Ato 1'));
    expect(treeItem('Estrada de Vharn')).not.toHaveAttribute('draggable', 'true');
    expect(treeItem('Ato 1')).not.toHaveAttribute('draggable', 'true');
  });

  it('nothing drags while reconnecting', async () => {
    await openLibrary(deps);
    await openCatacumbas();
    deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' });
    expect(treeItem('Ossuário')).not.toHaveAttribute('draggable', 'true');
    drag(treeItem('Ossuário'), treeItem('Lugares fixos'));
    await act(() => Promise.resolve());
    expect(deps.libraryApi.callsOf('updateScene')).toEqual([]);
  });
});
