import { render } from '@testing-library/react';
import type { CampaignDetailDto, SheetSummaryDto } from '@lorkarium/contracts';
import { SceneTabs } from '@/features/board/scene-tabs';
import { SheetRoomProvider } from '@/features/sheets/sheet-room';
import { testDependencies } from './app-dependencies';
import { ANA } from './auth-api-fake';
import { detailOf, VHARN } from './campaigns-api-fake';
import { vharnLibrary } from './library-fixtures';
import { lyraSheet, sheetResponse, sheetWrite } from './sheet-fixtures';
import { tormentaSummary } from './sheet-template-fixtures';
import { vharnBoard, vharnState } from './table-session-fixtures';

export const SHEET_ROOM_ACTION_ID = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';

/** VHARN open in the room as Ana (its tabs strip included), with the sheet services of the room
 *  around what `renderItems` draws; every command id is `SHEET_ROOM_ACTION_ID`.
 *
 *  Example: `const { deps, renderItems } = sheetRoom(); renderItems(<TokenMenu … />)` */
export function sheetRoom(campaign: CampaignDetailDto = detailOf(VHARN)) {
  const deps = testDependencies();
  deps.sessionStore.getState().signedIn(ANA);
  deps.openTables.getState().restore(ANA.id);
  deps.openTables.getState().open({ campaignId: VHARN.id, name: VHARN.name });
  deps.tableSessionApi.emitTo(
    VHARN.id,
    { kind: 'state', state: vharnState() },
    { kind: 'board', state: vharnBoard() },
  );
  const [table] = deps.openTables.getState().tables;
  if (!table) throw new Error(`VHARN did not open; opened: ${deps.tableSessionApi.opened}`);
  const services = {
    sheetsApi: deps.sheetsApi,
    libraryApi: deps.libraryApi,
    workspace: deps.documentWorkspace,
    openTables: deps.openTables,
    newActionId: () => SHEET_ROOM_ACTION_ID,
  };
  const renderItems = (items: React.ReactNode) =>
    render(
      <SheetRoomProvider campaign={campaign} services={services}>
        {items}
        <SceneTabs tabs={table.tabs} documents={deps.documentWorkspace} campaignId={VHARN.id} />
      </SheetRoomProvider>,
    );
  return { deps, table, renderItems };
}

type SheetRoomDeps = ReturnType<typeof sheetRoom>['deps'];

/** The library the master's submenus read: "Ficha Tormenta" and the `spare` sheets. */
export function libraryWithTormenta(
  deps: SheetRoomDeps,
  sheets: readonly SheetSummaryDto[] = [],
): void {
  deps.libraryApi.answer('list', {
    ok: true,
    value: vharnLibrary({ sheetTemplates: [tormentaSummary()], sheets: [...sheets] }),
  });
}

/** The server makes the sheet asked, named `name`: the answer of `create` (and of its read). */
export function sheetCreatedAs(deps: SheetRoomDeps, name: string): void {
  const created = lyraSheet({ name, canManage: true });
  deps.sheetsApi.createResult = { ok: true, value: sheetWrite(created, 'create') };
  deps.sheetsApi.response = sheetResponse(created);
}

/** What the server answers when the sheet `summary` is opened. */
export function serverSheetIs(deps: SheetRoomDeps, summary: SheetSummaryDto): void {
  deps.sheetsApi.response = sheetResponse(lyraSheet(summary));
}

/** `sheet:changed` of VHARN for `sheetId` at `version`. */
export function emitSheetChanged(deps: SheetRoomDeps, sheetId: string, version: number): void {
  deps.tableSessionApi.emitTo(VHARN.id, {
    kind: 'sheetChanged',
    event: { campaignId: VHARN.id, sheetId, version, at: '2026-10-31T12:00:00.000Z' },
  });
}
