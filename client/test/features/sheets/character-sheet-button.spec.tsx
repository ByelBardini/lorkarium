import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CharacterSheetButton } from '@/features/sheets/character-sheet-button';
import { LYRA_CHARACTER_ID } from '../../support/character-fixtures';
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

type ButtonOptions = Readonly<{
  memberId?: string | null;
  mainSheetId?: string | null;
  canControl?: boolean;
  madeMain?: string[];
}>;

function lyraButton(isMaster: boolean, options: ButtonOptions = {}) {
  return (
    <CharacterSheetButton
      characterId={LYRA_CHARACTER_ID}
      memberId={options.memberId === undefined ? BIA : options.memberId}
      mainSheetId={options.mainSheetId ?? null}
      name="Lyra"
      isMaster={isMaster}
      canControl={options.canControl ?? isMaster}
      onMakeMain={(sheetId) => options.madeMain?.push(sheetId)}
    />
  );
}

describe('sheets on the "Na mesa" card', () => {
  it('a reader with one sheet gets "Abrir ficha de Lyra", which opens it at once', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary()];
    renderItems(lyraButton(false));
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir ficha de Lyra' }));
    expect(await screen.findByRole('tab', { name: 'Ficha · Lyra de Vharn' })).toBeInTheDocument();
    expect(deps.sheetsApi.ofCharacterCalls).toEqual([LYRA_CHARACTER_ID]);
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('a reader with several sheets picks which one to open in "Fichas de Lyra"', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary(), SPELLS];
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

  it('a reader without sheets gets no button', async () => {
    const { deps, renderItems } = sheetRoom();
    renderItems(lyraButton(false));
    await waitFor(() => expect(deps.sheetsApi.ofCharacterCalls).toHaveLength(1));
    await act(() => Promise.resolve());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('with several sheets, "Abrir ficha de Lyra" opens the main one in one click', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary(), SPELLS];
    serverSheetIs(deps, SPELLS);
    renderItems(lyraButton(false, { mainSheetId: SPELLS.id }));
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir ficha de Lyra' }));
    expect(await screen.findByRole('tab', { name: 'Ficha · Magias de Lyra' })).toBeInTheDocument();
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('"Fichas de Lyra" marks the main sheet; its player makes another one the main', async () => {
    const { deps, renderItems } = sheetRoom();
    const madeMain: string[] = [];
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary(), SPELLS];
    renderItems(lyraButton(false, { mainSheetId: LYRA_SHEET_ID, canControl: true, madeMain }));
    await userEvent.click(await screen.findByRole('button', { name: 'Fichas de Lyra' }));
    const main = screen.getByRole('menuitem', { name: /Lyra de Vharn/ });
    expect(main).toHaveTextContent('Lyra de Vharnprincipal');
    expect(screen.getByRole('menuitem', { name: 'Magias de Lyra' })).not.toHaveTextContent(
      'principal',
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Tornar principal' }));
    await waitFor(() => expect(screen.getAllByRole('menu')).toHaveLength(2));
    const submenu = screen.getAllByRole('menu').at(-1);
    if (!submenu) throw new Error('"Tornar principal" opened no submenu');
    const choices = within(submenu).getAllByRole('menuitem');
    expect(choices.map((item) => item.textContent)).toEqual(['Magias de Lyra']);
    await userEvent.click(within(submenu).getByRole('menuitem', { name: 'Magias de Lyra' }));
    expect(madeMain).toEqual([SPELLS.id]);
  });

  it('who does not control the character gets no "Tornar principal"', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary(), SPELLS];
    renderItems(lyraButton(false, { mainSheetId: LYRA_SHEET_ID, canControl: false }));
    await userEvent.click(await screen.findByRole('button', { name: 'Fichas de Lyra' }));
    expect(screen.queryByRole('menuitem', { name: 'Tornar principal' })).not.toBeInTheDocument();
  });

  it('the master of a character nobody plays gets no "Nova ficha"', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary(), SPELLS];
    renderItems(lyraButton(true, { memberId: null }));
    await userEvent.click(await screen.findByRole('button', { name: 'Fichas de Lyra' }));
    expect(screen.queryByRole('menuitem', { name: 'Nova ficha' })).not.toBeInTheDocument();
  });

  it('the master makes a sheet for the player of a character with none yet: held by the member', async () => {
    const { deps, renderItems } = sheetRoom();
    libraryWithTormenta(deps);
    sheetCreatedAs(deps, 'Ficha Tormenta · Lyra');
    renderItems(lyraButton(true));
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
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary()];
    libraryWithTormenta(deps, [lyraSummary(), spareSummary()]);
    renderItems(lyraButton(true));
    await userEvent.click(await screen.findByRole('button', { name: 'Fichas de Lyra' }));
    expect(screen.getByRole('menuitem', { name: 'Lyra de Vharn' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dar ficha existente' }));
    await screen.findByRole('menuitem', { name: 'Ficha reserva' });
    // Only the item of the character's own sheet, none among the spare ones.
    expect(screen.getAllByRole('menuitem', { name: 'Lyra de Vharn' })).toHaveLength(1);
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
    await waitFor(() => expect(deps.sheetsApi.ofCharacterCalls).toHaveLength(1));
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary()];
    emitSheetChanged(deps, LYRA_SHEET_ID, 2);
    expect(await screen.findByRole('button', { name: 'Abrir ficha de Lyra' })).toBeVisible();
  });
});
