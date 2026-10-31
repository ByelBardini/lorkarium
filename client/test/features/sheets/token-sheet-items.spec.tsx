import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TokenDto } from '@lorkarium/contracts';
import { TokenSheetItems } from '@/features/sheets/token-sheet-items';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LYRA_ANCHOR_ID, linkedLyra } from '../../support/cast-fixtures';
import {
  GOBLIN_SHEET_ID,
  LYRA_SHEET_ID,
  TORMENTA_TEMPLATE_ID,
  lyraSummary,
} from '../../support/sheet-fixtures';
import {
  SHEET_ROOM_ACTION_ID,
  emitSheetChanged,
  libraryWithTormenta,
  serverSheetIs,
  sheetCreatedAs,
  sheetRoom,
} from '../../support/sheet-room-harness';
import { kael } from '../../support/table-session-fixtures';

const SPELLS = lyraSummary({ id: GOBLIN_SHEET_ID, name: 'Magias de Lyra' });

function TokenMenu({ token, isMaster }: Readonly<{ token: TokenDto; isMaster: boolean }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>{`Ações de ${token.name}`}</DropdownMenuTrigger>
      <DropdownMenuContent>
        <TokenSheetItems token={token} name={token.name} isMaster={isMaster} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

async function openMenu(name = 'Lyra'): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: `Ações de ${name}` }));
}

describe('sheet items of a token', () => {
  it('one sheet: "Abrir ficha" puts the tab "Ficha · <sheet name>" in the strip, read on the anchor', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfToken[LYRA_ANCHOR_ID] = [lyraSummary()];
    renderItems(<TokenMenu token={linkedLyra()} isMaster={false} />);
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Abrir ficha' }));
    expect(deps.sheetsApi.ofTokenCalls).toEqual([LYRA_ANCHOR_ID]);
    const tab = await screen.findByRole('tab', { name: 'Ficha · Lyra de Vharn' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(deps.documentWorkspace.getState().sheets.map((sheet) => sheet.sheetId)).toEqual([
      LYRA_SHEET_ID,
    ]);
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('several sheets: "Fichas ▸" lists them by name and opens the one picked', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfToken[LYRA_ANCHOR_ID] = [lyraSummary(), SPELLS];
    serverSheetIs(deps, SPELLS);
    renderItems(<TokenMenu token={linkedLyra()} isMaster={false} />);
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Fichas' }));
    expect(screen.queryByRole('menuitem', { name: 'Abrir ficha' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Magias de Lyra' }));
    expect(await screen.findByRole('tab', { name: 'Ficha · Magias de Lyra' })).toBeInTheDocument();
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('no sheet: the player sees nothing, the master only "Nova ficha"', async () => {
    const { deps, renderItems } = sheetRoom();
    const { unmount } = renderItems(<TokenMenu token={linkedLyra()} isMaster={false} />);
    await openMenu();
    await waitFor(() => expect(deps.sheetsApi.ofTokenCalls).toHaveLength(1));
    await act(() => Promise.resolve());
    expect(screen.queryAllByRole('menuitem')).toEqual([]);
    unmount();
    renderItems(<TokenMenu token={linkedLyra()} isMaster />);
    await openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Nova ficha' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Abrir ficha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Tirar do token' })).not.toBeInTheDocument();
  });

  it('"Nova ficha ▸ Ficha Tormenta" makes "<template> · <token>" held by the token clicked and opens it', async () => {
    const { deps, renderItems } = sheetRoom();
    libraryWithTormenta(deps);
    sheetCreatedAs(deps, 'Ficha Tormenta · Kael');
    renderItems(<TokenMenu token={kael()} isMaster />);
    await openMenu('Kael');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Nova ficha' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ficha Tormenta' }));
    await screen.findByRole('tab', { name: 'Ficha · Ficha Tormenta · Kael' });
    expect(deps.sheetsApi.creates).toEqual([
      {
        actionId: SHEET_ROOM_ACTION_ID,
        templateId: TORMENTA_TEMPLATE_ID,
        name: 'Ficha Tormenta · Kael',
        holder: { tokenId: kael().id },
      },
    ]);
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('one sheet: the master shows it to the whole table and takes it off the token', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfToken[LYRA_ANCHOR_ID] = [lyraSummary()];
    deps.sheetsApi.updateResult = { ok: false, failure: { kind: 'offline' } };
    renderItems(<TokenMenu token={linkedLyra()} isMaster />);
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Quem vê a ficha' }));
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'A mesa toda (só leitura)' }),
    );
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Tirar do token' }));
    expect(deps.sheetsApi.updates).toEqual([
      { sheetId: LYRA_SHEET_ID, input: { actionId: SHEET_ROOM_ACTION_ID, visibility: 'table' } },
      { sheetId: LYRA_SHEET_ID, input: { actionId: SHEET_ROOM_ACTION_ID, holder: null } },
    ]);
  });

  it('several sheets: the master manages each one in its own submenu', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfToken[LYRA_ANCHOR_ID] = [lyraSummary(), SPELLS];
    renderItems(<TokenMenu token={linkedLyra()} isMaster />);
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ficha Magias de Lyra' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Tirar do token' }));
    expect(deps.sheetsApi.updates).toEqual([
      { sheetId: GOBLIN_SHEET_ID, input: { actionId: SHEET_ROOM_ACTION_ID, holder: null } },
    ]);
  });

  it('a refused command is said in the room, and nothing opens', async () => {
    const { deps, renderItems } = sheetRoom();
    libraryWithTormenta(deps);
    deps.sheetsApi.createResult = { ok: false, failure: { kind: 'not_found' } };
    renderItems(<TokenMenu token={linkedLyra()} isMaster />);
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Nova ficha' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ficha Tormenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A ficha, o modelo ou o token não existe mais.',
    );
    expect(deps.documentWorkspace.getState().sheets).toEqual([]);
  });

  it('reads the sheets again at each sheet:changed of the table', async () => {
    const { deps, renderItems } = sheetRoom();
    renderItems(<TokenMenu token={linkedLyra()} isMaster={false} />);
    await openMenu();
    await waitFor(() => expect(deps.sheetsApi.ofTokenCalls).toHaveLength(1));
    deps.sheetsApi.sheetsOfToken[LYRA_ANCHOR_ID] = [lyraSummary()];
    emitSheetChanged(deps, LYRA_SHEET_ID, 2);
    await waitFor(() => expect(deps.sheetsApi.ofTokenCalls).toHaveLength(2));
    expect(await screen.findByRole('menuitem', { name: 'Abrir ficha' })).toBeInTheDocument();
  });
});
