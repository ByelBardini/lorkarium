import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { SceneTabs } from '@/features/board/scene-tabs';
import {
  createDocumentWorkspaceStore,
  type DocumentWorkspaceStore,
} from '@/stores/document-workspace-store';
import type { OpenTable } from '@/stores/open-tables-store';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { DataTransferFake } from '../../support/data-transfer-fake';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import { documentFixture } from '../../support/documents-fixtures';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { LibraryMapsApiFake } from '../../support/library-maps-api-fake';
import { ESTRADA_SCENE, TORRE_SCENE, estradaBoard } from '../../support/scene-tab-fixtures';
import { openTorreTab, openVharnTabs } from '../../support/scene-tabs-harness';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';
import { SheetsApiFake } from '../../support/sheets-api-fake';
import { TableSessionApiFake } from '../../support/table-session-api-fake';

function workspaceOfFakes(): StoreApi<DocumentWorkspaceStore> {
  return createDocumentWorkspaceStore({
    api: new DocumentsApiFake(),
    sheetsApi: new SheetsApiFake(),
    sheetTemplatesApi: new SheetTemplatesApiFake(),
    mapsApi: new LibraryMapsApiFake(),
    clock: new InteractionClockFake(),
  });
}

describe('SceneTabs in the order the tabs were opened', () => {
  let table: OpenTable;
  let workspace: StoreApi<DocumentWorkspaceStore>;

  // Torre, then the document Carta, then the Estrada: a grid opened after a document.
  beforeEach(async () => {
    const api = new TableSessionApiFake();
    table = openVharnTabs(api);
    openTorreTab(api, table);
    workspace = workspaceOfFakes();
    render(<SceneTabs tabs={table.tabs} documents={workspace} campaignId={VHARN.id} />);
    act(() => {
      workspace.getState().open({ campaign: detailOf(VHARN), document: documentFixture() });
    });
    act(() => {
      table.tabs.getState().open(ESTRADA_SCENE.id);
      api.emitToGrid(ESTRADA_SCENE.id, { kind: 'board', state: estradaBoard() });
    });
    await act(() => Promise.resolve());
  });

  function tabNames(): string[] {
    const tablist = screen.getByRole('tablist', { name: 'Grids abertos' });
    return within(tablist)
      .getAllByRole('tab')
      .map((tab) => tab.textContent ?? '');
  }

  function frameOf(name: string | RegExp): HTMLElement {
    const frame = screen.getByRole('tab', { name }).parentElement;
    if (!frame) throw new Error(`tab ${String(name)} has no frame`);
    return frame;
  }

  // The tablist's box: the whole strip, the empty room after the last tab too.
  function zone(): HTMLElement {
    const strip = screen.getByRole('tablist', { name: 'Grids abertos' }).parentElement;
    if (!strip) throw new Error('the tablist has no strip around it');
    return strip;
  }

  // jsdom lays nothing out: each frame, in the order on screen, gets 100 px from the left.
  function layOutTabs(): void {
    const tablist = screen.getByRole('tablist', { name: 'Grids abertos' });
    within(tablist)
      .getAllByRole('tab')
      .forEach((tab, index) => {
        const box = { left: index * 100, width: 100, top: 0, height: 40 } as DOMRect;
        if (tab.parentElement) tab.parentElement.getBoundingClientRect = () => box;
      });
  }

  // jsdom's drag events drop `clientX`: it is set on the event by hand.
  function dragAt(type: 'dragOver' | 'drop', element: HTMLElement, clientX: number): boolean {
    const event = createEvent[type](element, { dataTransfer });
    Object.defineProperty(event, 'clientX', { value: clientX });
    return fireEvent(element, event);
  }

  let dataTransfer: DataTransferFake;

  function startDragging(name: string): void {
    layOutTabs();
    dataTransfer = new DataTransferFake();
    fireEvent.dragStart(frameOf(name), { dataTransfer });
  }

  function marks(): (string | null)[] {
    return [...zone().querySelectorAll('[data-room-tab]')].map((frame) =>
      frame.getAttribute('data-drop-side'),
    );
  }

  it('mixes grids and documents in the order they opened, the group first', () => {
    expect(tabNames()).toEqual(['Cena 1Grupo', 'Torre', 'Carta', 'Estrada de Vharn']);
  });

  it('on the left half of a tab, the mark is before it and the drop lands there', () => {
    startDragging('Estrada de Vharn');
    dragAt('dragOver', frameOf('Torre'), 120);
    expect(frameOf('Torre')).toHaveAttribute('data-drop-side', 'before');
    dragAt('drop', frameOf('Torre'), 120);
    expect(tabNames()).toEqual(['Cena 1Grupo', 'Estrada de Vharn', 'Torre', 'Carta']);
    expect(marks()).toEqual([null, null, null, null]);
  });

  it('on the right half of a tab, the drop lands after it (before the next one)', () => {
    startDragging('Torre');
    dragAt('dragOver', frameOf('Carta'), 280);
    expect(frameOf('Estrada de Vharn')).toHaveAttribute('data-drop-side', 'before');
    dragAt('drop', frameOf('Carta'), 280);
    expect(tabNames()).toEqual(['Cena 1Grupo', 'Carta', 'Torre', 'Estrada de Vharn']);
  });

  it('past the last tab, on the empty strip, the mark is after it and the drop goes to the end', () => {
    startDragging('Torre');
    dragAt('dragOver', zone(), 600);
    expect(marks()).toEqual([null, null, null, 'after']);
    dragAt('drop', zone(), 600);
    expect(tabNames()).toEqual(['Cena 1Grupo', 'Carta', 'Estrada de Vharn', 'Torre']);
  });

  // The tablist clips what passes its edge (overflow-hidden): a bar drawn past the last frame's
  // right side was cut out, and the drop at the end showed no mark at all.
  it('the end mark is drawn inside the last frame, where the tablist does not clip it', () => {
    startDragging('Torre');
    dragAt('dragOver', zone(), 600);
    const bar = frameOf('Estrada de Vharn').querySelector('[aria-hidden="true"].bg-primary');
    expect(bar).toHaveClass('right-0');
    expect(bar).not.toHaveClass('-right-0.5');
  });

  it('a drop says where the tab went, as the keyboard move does', () => {
    startDragging('Torre');
    dragAt('drop', zone(), 600);
    expect(screen.getByRole('status', { name: 'Ordem das abas' })).toHaveTextContent(
      'Torre agora é a aba 4 de 4.',
    );
  });

  it('nothing lands before the group: its left half means the first after it; it is never dragged', () => {
    expect(frameOf(/Cena 1/)).not.toHaveAttribute('draggable');
    startDragging('Carta');
    dragAt('dragOver', frameOf(/Cena 1/), 10);
    expect(frameOf('Torre')).toHaveAttribute('data-drop-side', 'before');
    dragAt('drop', frameOf(/Cena 1/), 10);
    expect(tabNames()).toEqual(['Cena 1Grupo', 'Carta', 'Torre', 'Estrada de Vharn']);
  });

  it('where the tab already is, nothing is marked and the drop moves nothing', () => {
    startDragging('Torre');
    dragAt('dragOver', frameOf('Torre'), 140);
    expect(marks()).toEqual([null, null, null, null]);
    dragAt('drop', frameOf('Torre'), 140);
    expect(tabNames()).toEqual(['Cena 1Grupo', 'Torre', 'Carta', 'Estrada de Vharn']);
  });

  it('a drag that did not start on a tab of the strip (the library) is not taken', () => {
    layOutTabs();
    dataTransfer = new DataTransferFake();
    expect(dragAt('dragOver', zone(), 600)).toBe(true);
    expect(marks()).toEqual([null, null, null, null]);
  });

  it('Ctrl+Shift+← moves the focused tab left, keeps its focus and says where it is now', async () => {
    const carta = screen.getByRole('tab', { name: 'Carta' });
    carta.focus();
    await userEvent.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');
    expect(tabNames()).toEqual(['Cena 1Grupo', 'Carta', 'Torre', 'Estrada de Vharn']);
    expect(screen.getByRole('tab', { name: 'Carta' })).toHaveFocus();
    expect(screen.getByRole('status', { name: 'Ordem das abas' })).toHaveTextContent(
      'Carta agora é a aba 2 de 4.',
    );
  });

  it('Ctrl+Shift+→ moves it right; nothing passes before the group, nor moves it', async () => {
    screen.getByRole('tab', { name: 'Torre' }).focus();
    await userEvent.keyboard('{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}');
    expect(tabNames()).toEqual(['Cena 1Grupo', 'Carta', 'Torre', 'Estrada de Vharn']);
    screen.getByRole('tab', { name: 'Carta' }).focus();
    await userEvent.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');
    screen.getByRole('tab', { name: /Cena 1/ }).focus();
    await userEvent.keyboard('{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}');
    expect(tabNames()).toEqual(['Cena 1Grupo', 'Carta', 'Torre', 'Estrada de Vharn']);
    expect(screen.getByRole('tab', { name: /Cena 1/ })).toHaveFocus();
  });

  it('a tab moved by keyboard keeps the focus even where moving an element drops it (Chrome)', async () => {
    const insertBefore = Node.prototype.insertBefore;
    // jsdom keeps the focus of a moved element; Chrome runs its focus fixup and drops it.
    const moves = vi
      .spyOn(Node.prototype, 'insertBefore')
      .mockImplementation(function moveDroppingFocus<T extends Node>(
        this: Node,
        node: T,
        child: Node | null,
      ): T {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && node.contains(focused)) focused.blur();
        return insertBefore.call(this, node, child) as T;
      });
    try {
      screen.getByRole('tab', { name: 'Torre' }).focus();
      await userEvent.keyboard('{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}');
      expect(tabNames()).toEqual(['Cena 1Grupo', 'Carta', 'Torre', 'Estrada de Vharn']);
      expect(screen.getByRole('tab', { name: 'Torre' })).toHaveFocus();
    } finally {
      moves.mockRestore();
    }
  });

  it('a movable tab names its keys; the group tab, that never moves, does not', () => {
    expect(screen.getByRole('tab', { name: 'Torre' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+Shift+ArrowLeft Control+Shift+ArrowRight',
    );
    expect(screen.getByRole('tab', { name: /Cena 1/ })).not.toHaveAttribute('aria-keyshortcuts');
  });

  it('closing the document takes it out and the others keep their order', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Fechar documento Carta' }));
    expect(tabNames()).toEqual(['Cena 1Grupo', 'Torre', 'Estrada de Vharn']);
    expect(table.tabs.getState().tabOrder).toEqual([TORRE_SCENE.id, ESTRADA_SCENE.id]);
  });
});
