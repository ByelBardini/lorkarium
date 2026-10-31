import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CharacterSheetButton } from '@/features/sheets/character-sheet-button';
import { LYRA_ANCHOR_ID } from '../../support/cast-fixtures';
import {
  GOBLIN_SHEET_ID,
  LYRA_SHEET_ID,
  SPARE_SHEET_ID,
  TORMENTA_TEMPLATE_ID,
  lyraSummary,
  spareSummary,
} from '../../support/sheet-fixtures';
import {
  SHEET_ROOM_ACTION_ID,
  emitSheetChanged,
  libraryWithTormenta,
  serverSheetIs,
  sheetCreatedAs,
  sheetRoom,
} from '../../support/sheet-room-harness';
import { BIA_AT_TABLE } from '../../support/table-session-fixtures';

const SPELLS = lyraSummary({ id: GOBLIN_SHEET_ID, name: 'Magias de Lyra' });
const BIA = BIA_AT_TABLE.userId;

function lyraButton(isMaster: boolean, anchorTokenId: string | null = LYRA_ANCHOR_ID) {
  return (
    <CharacterSheetButton
      memberId={BIA}
      anchorTokenId={anchorTokenId}
      name="Lyra"
      isMaster={isMaster}
    />
  );
}

describe('sheets on the "Na mesa" card', () => {
  it('a reader with one sheet gets "Abrir ficha de Lyra", which opens it at once', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfToken[LYRA_ANCHOR_ID] = [lyraSummary()];
    renderItems(lyraButton(false));
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir ficha de Lyra' }));
    expect(await screen.findByRole('tab', { name: 'Ficha · Lyra de Vharn' })).toBeInTheDocument();
    expect(deps.sheetsApi.ofTokenCalls).toEqual([LYRA_ANCHOR_ID]);
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('a reader with several sheets picks which one to open in "Fichas de Lyra"', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfToken[LYRA_ANCHOR_ID] = [lyraSummary(), SPELLS];
    serverSheetIs(deps, SPELLS);
    renderItems(lyraButton(false));
    await userEvent.click(await screen.findByRole('button', { name: 'Fichas de Lyra' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Lyra de Vharn',
      'Magias de Lyra',
    ]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Magias de Lyra' }));
    expect(await screen.findByRole('tab', { name: 'Ficha · Magias de Lyra' })).toBeInTheDocument();
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('a reader without sheets, or without a character, gets no button (and nothing is read)', async () => {
    const { deps, renderItems } = sheetRoom();
    const { unmount } = renderItems(lyraButton(false));
    await waitFor(() => expect(deps.sheetsApi.ofTokenCalls).toHaveLength(1));
    await act(() => Promise.resolve());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    renderItems(lyraButton(false, null));
    await act(() => Promise.resolve());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(deps.sheetsApi.ofTokenCalls).toHaveLength(1);
  });

  it('the master makes a sheet for a player with no character yet: held by the member', async () => {
    const { deps, renderItems } = sheetRoom();
    libraryWithTormenta(deps);
    sheetCreatedAs(deps, 'Ficha Tormenta · Lyra');
    renderItems(lyraButton(true, null));
    await userEvent.click(await screen.findByRole('button', { name: 'Fichas de Lyra' }));
    expect(screen.queryByRole('menuitem', { name: 'Abrir ficha' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Nova ficha' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ficha Tormenta' }));
    expect(deps.sheetsApi.creates).toEqual([
      {
        actionId: SHEET_ROOM_ACTION_ID,
        templateId: TORMENTA_TEMPLATE_ID,
        name: 'Ficha Tormenta · Lyra',
        holder: { memberId: BIA },
      },
    ]);
    expect(await screen.findByRole('tab', { name: 'Ficha · Ficha Tormenta · Lyra' })).toBeVisible();
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('the master gives the player a sheet nobody holds, from "Dar ficha existente"', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfToken[LYRA_ANCHOR_ID] = [lyraSummary()];
    libraryWithTormenta(deps, [lyraSummary(), spareSummary()]);
    renderItems(lyraButton(true));
    await userEvent.click(await screen.findByRole('button', { name: 'Fichas de Lyra' }));
    expect(screen.getByRole('menuitem', { name: 'Abrir ficha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dar ficha existente' }));
    await screen.findByRole('menuitem', { name: 'Ficha reserva' });
    expect(screen.queryByRole('menuitem', { name: 'Lyra de Vharn' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ficha reserva' }));
    expect(deps.sheetsApi.updates).toEqual([
      {
        sheetId: SPARE_SHEET_ID,
        input: { actionId: SHEET_ROOM_ACTION_ID, holder: { memberId: BIA } },
      },
    ]);
  });

  it('with no spare sheet, "Dar ficha existente" says so', async () => {
    const { deps, renderItems } = sheetRoom();
    libraryWithTormenta(deps, [lyraSummary()]);
    renderItems(lyraButton(true));
    await userEvent.click(await screen.findByRole('button', { name: 'Fichas de Lyra' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dar ficha existente' }));
    expect(await screen.findByRole('menuitem', { name: 'Nenhuma ficha sem dono' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('a sheet given to the player shows on the card at the next sheet:changed', async () => {
    const { deps, renderItems } = sheetRoom();
    renderItems(lyraButton(false));
    await waitFor(() => expect(deps.sheetsApi.ofTokenCalls).toHaveLength(1));
    deps.sheetsApi.sheetsOfToken[LYRA_ANCHOR_ID] = [lyraSummary()];
    emitSheetChanged(deps, LYRA_SHEET_ID, 2);
    expect(await screen.findByRole('button', { name: 'Abrir ficha de Lyra' })).toBeVisible();
  });
});
