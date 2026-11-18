import { PLAN_LIMITS, type PlanLimits } from '@lorkarium/contracts';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SheetPanel } from '@/features/sheets/sheet-panel';
import { characterSource } from '@/sheet-sandbox/sheet-token-source';
import { createSheetStore } from '@/stores/sheet-store';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { lyraCharacter, syncedCharacters } from '../../support/character-fixtures';
import { CharacterCommandsFake } from '../../support/character-commands-fake';
import { DiceCommandsFake } from '../../support/dice-commands-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { noDocuments } from '../../support/sheet-bridge-harness';
import { SheetCommandsFake } from '../../support/sheet-commands-fake';
import {
  LYRA_SHEET_ID,
  lyraSheet,
  sheetResponse,
  tormentaCode,
} from '../../support/sheet-fixtures';
import { SheetChannelsFake } from '../../support/sheet-frame-fakes';
import { SheetsApiFake } from '../../support/sheets-api-fake';
import { BIA_AT_TABLE } from '../../support/table-session-fixtures';
import { onTablePlan } from '../../support/table-plan';

const TITLE = 'Ficha · Lyra de Vharn';
const SCRIPTS_OFF = 'Os scripts deste modelo não rodam no plano Grátis. Disponível no Narrador';
const FILES = [
  { path: 'index.html', content: '<input data-lk="forca">' },
  { path: 'a.js', content: 'window.authorRan = true;' },
];

// Lyra's sheet, its template with a JS file, on a table of `limits`; `canManage` = the master.
async function renderOnPlan(limits: PlanLimits, canManage = true): Promise<HTMLIFrameElement> {
  const api = new SheetsApiFake();
  api.response = sheetResponse(lyraSheet({ canManage }), tormentaCode({ files: FILES }));
  const clock = new InteractionClockFake();
  const store = createSheetStore({
    ...{ api, campaignId: VHARN.id, sheetId: LYRA_SHEET_ID, clock },
    newActionId: () => '00000000-0000-4000-8000-000000000001',
  });
  await store.getState().load();
  const services = {
    ...{ sheetsApi: api, sheetCommands: new SheetCommandsFake(), clock },
    ...{ boardCommands: new CharacterCommandsFake(), assets: new AssetsApiFake() },
    ...{ documents: noDocuments(), dice: new DiceCommandsFake() },
  };
  const tokens = characterSource(syncedCharacters(lyraCharacter()), BIA_AT_TABLE.userId);
  const channels = new SheetChannelsFake();
  render(
    onTablePlan(
      limits,
      <SheetPanel
        {...{ campaignId: VHARN.id, title: TITLE, store, tokens, services }}
        createChannel={channels.create}
      />,
    ),
  );
  const frame = screen.getByTitle(TITLE) as HTMLIFrameElement;
  vi.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  act(() => void fireEvent.load(frame));
  return frame;
}

async function consolePanel(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: /Console da ficha/ }));
  return screen.findByRole('dialog', { name: 'Console da ficha' });
}

describe('SheetPanel on a table whose plan has no sheetScripts', () => {
  it('the frame opens with the markup and without the author js', async () => {
    const frame = await renderOnPlan(PLAN_LIMITS.free);
    const srcdoc = frame.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('<input data-lk="forca">');
    expect(srcdoc).not.toContain('window.authorRan');
  });

  it('the master reads in the console that the scripts do not run, and where they do', async () => {
    await renderOnPlan(PLAN_LIMITS.free);
    expect(within(await consolePanel()).getByText(SCRIPTS_OFF)).toBeInTheDocument();
  });

  it('on a Narrador table the js runs and the console says nothing about it', async () => {
    const frame = await renderOnPlan(PLAN_LIMITS.narrador);
    expect(frame.getAttribute('srcdoc')).toContain('window.authorRan = true;');
    expect(within(await consolePanel()).queryByText(SCRIPTS_OFF)).toBeNull();
  });

  it('a player on a Grátis table gets the frame without js and no console at all', async () => {
    const frame = await renderOnPlan(PLAN_LIMITS.free, false);
    expect(frame.getAttribute('srcdoc')).not.toContain('window.authorRan');
    expect(screen.queryByRole('button', { name: /Console da ficha/ })).toBeNull();
  });
});
