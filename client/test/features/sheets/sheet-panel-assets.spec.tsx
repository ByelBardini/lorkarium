import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';
import { SheetsApiFake } from '../../support/sheets-api-fake';
import { BIA_AT_TABLE } from '../../support/table-session-fixtures';

const TITLE = 'Ficha · Lyra de Vharn';
const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32]).buffer;

// Lyra's sheet whose template draws its title in a font of the template.
async function renderWithFont(templateAssets: SheetTemplatesApiFake, assetId: string) {
  const api = new SheetsApiFake();
  const manifest = { permissions: [], bars: [], assets: [{ path: 'fontes/x.woff2', assetId }] };
  const files = [
    { path: 'index.html', content: '<h1>Lyra</h1>' },
    {
      path: 'estilo.css',
      content: '@font-face { font-family: L; src: url("asset:fontes/x.woff2") }',
    },
  ];
  api.response = sheetResponse(lyraSheet(), tormentaCode({ files, manifest }));
  const clock = new InteractionClockFake();
  const store = createSheetStore({
    ...{ api, campaignId: VHARN.id, sheetId: LYRA_SHEET_ID, clock },
    newActionId: () => '00000000-0000-4000-8000-000000000001',
  });
  await store.getState().load();
  const services = {
    sheetsApi: api,
    sheetCommands: new SheetCommandsFake(),
    boardCommands: new CharacterCommandsFake(),
    assets: new AssetsApiFake(),
    documents: noDocuments(),
    dice: new DiceCommandsFake(),
    clock,
    templateAssets,
  };
  const tokens = characterSource(syncedCharacters(lyraCharacter()), BIA_AT_TABLE.userId);
  render(
    <SheetPanel
      {...{ campaignId: VHARN.id, title: TITLE, store, tokens, services }}
      createChannel={new SheetChannelsFake().create}
    />,
  );
}

describe('SheetPanel with the assets of its template', () => {
  it('reads the font of the template and embeds it in the frame as a data url', async () => {
    const templates = new SheetTemplatesApiFake();
    const sent = await templates.uploadAsset(VHARN.id, WOFF2, 'font/woff2');
    await renderWithFont(templates, sent.ok ? sent.value.id : '');

    const frame = await screen.findByTitle(TITLE);

    expect(frame.getAttribute('srcdoc')).toContain('url("data:font/woff2;base64,d09GMg==")');
    expect(frame.getAttribute('srcdoc')).not.toContain('asset:');
  });

  it('a font that cannot be read shows why, with no frame', async () => {
    await renderWithFont(new SheetTemplatesApiFake(), '00000000-0000-4000-8000-0000000000ff');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não deu para ler o asset "fontes/x.woff2" do modelo.',
    );
    expect(screen.queryByTitle(TITLE)).toBeNull();
  });
});
