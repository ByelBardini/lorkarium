import type { SheetManifestPermissionDto } from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createSheetBridgeHost, type SheetBridgeHost } from '@/sheet-sandbox/sheet-bridge-host';
import type { SheetDocumentSources } from '@/sheet-sandbox/sheet-bridge-documents';
import type { SheetTrayTarget } from '@/sheet-sandbox/sheet-bridge-tray';
import type { SheetTokenSource } from '@/sheet-sandbox/sheet-token-source';
import { characterSource } from '@/sheet-sandbox/sheet-token-source';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { diceTrayStoreOf, type DiceTrayStore } from '@/stores/dice-tray-store';
import { savedRollsStoreOf } from '@/stores/saved-rolls-store';
import { createSheetStore, type SheetStoreState } from '@/stores/sheet-store';
import { AssetsApiFake } from './assets-api-fake';
import { VHARN } from './campaigns-api-fake';
import { charactersSynced, lyraCharacter } from './character-fixtures';
import { CharacterCommandsFake } from './character-commands-fake';
import { DiceCommandsFake } from './dice-commands-fake';
import { DocumentsApiFake } from './documents-api-fake';
import { InteractionClockFake } from './interaction-clock-fake';
import { LibraryApiFake } from './library-api-fake';
import { SavedRollsApiFake } from './saved-rolls-api-fake';
import { SheetCommandsFake } from './sheet-commands-fake';
import { LYRA_SHEET_ID, lyraSheet, sheetResponse, tormentaCode } from './sheet-fixtures';
import { SheetHostPortFake } from './sheet-host-port-fake';
import { SheetsApiFake } from './sheets-api-fake';
import { BIA_AT_TABLE } from './table-session-fixtures';

export type SheetBridgeHarness = Readonly<{
  port: SheetHostPortFake;
  api: SheetsApiFake;
  clock: InteractionClockFake;
  commands: SheetCommandsFake;
  characterCommands: CharacterCommandsFake;
  assets: AssetsApiFake;
  library: LibraryApiFake;
  documents: DocumentsApiFake;
  characters: StoreApi<CharactersStore>;
  sheet: StoreApi<SheetStoreState>;
  dice: DiceCommandsFake;
  /** The viewer's saved rolls at Vharn, behind the shared store the room lists them in. */
  savedRolls: SavedRollsApiFake;
  /** The room's tray at Vharn (the one the "Dados" tab shows). */
  tray: StoreApi<DiceTrayStore>;
  host: SheetBridgeHost;
  /** The frame sends `data` and the host's answer settles. */
  frameSends: (data: unknown) => Promise<void>;
}>;

export type SheetBridgeSetup = Readonly<{
  /** What the template's manifest declares (nothing by default). */
  permissions?: readonly SheetManifestPermissionDto[];
  canEdit?: boolean;
  /** The holder's source; Lyra's character (Bia's) by default. */
  tokenOf?: (characters: StoreApi<CharactersStore>) => SheetTokenSource | null;
  /** `false`: the viewer has no tray (a spectator). */
  withTray?: boolean;
}>;

/** Document sources that answer like an untouched library: for a host whose spec reads none.
 *
 *  Example: `createSheetBridgeHost({ ..., documents: noDocuments() })` */
export function noDocuments(): SheetDocumentSources {
  return { library: new LibraryApiFake(), documents: new DocumentsApiFake() };
}

export function settledHost(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The host of Lyra's sheet in Vharn, with every port a named fake: the sheet is loaded, the
 *  characters are synced and nothing was sent yet.
 *
 *  Example: `const { frameSends, characterCommands } = await sheetBridgeHarness({ permissions: ['character:stats'] })` */
export async function sheetBridgeHarness(
  setup: SheetBridgeSetup = {},
): Promise<SheetBridgeHarness> {
  const api = new SheetsApiFake();
  const manifest = { permissions: [...(setup.permissions ?? [])], bars: [], assets: [] };
  api.response = sheetResponse(
    lyraSheet({ canEdit: setup.canEdit ?? true }),
    tormentaCode({ manifest }),
  );
  const clock = new InteractionClockFake();
  const characters = createCharactersStore(VHARN.id, () => undefined);
  characters.getState().apply(charactersSynced(3, lyraCharacter()));
  const sheet = createSheetStore({
    ...{ api, campaignId: VHARN.id, sheetId: LYRA_SHEET_ID, clock },
    newActionId: () => '00000000-0000-4000-8000-000000000001',
  });
  await sheet.getState().load();
  const fakes = {
    port: new SheetHostPortFake(),
    commands: new SheetCommandsFake(),
    characterCommands: new CharacterCommandsFake(),
    assets: new AssetsApiFake(),
    library: new LibraryApiFake(),
    documents: new DocumentsApiFake(),
  };
  const dice = new DiceCommandsFake();
  const savedRolls = new SavedRollsApiFake();
  const openTables = createStore(() => ({ tables: [{ campaignId: VHARN.id }] }));
  const tray = diceTrayStoreOf(openTables, VHARN.id, sequentialPieceIds());
  const diceTray: SheetTrayTarget | null =
    setup.withTray === false ? null : { tray, savedRolls: savedRollsStoreOf(savedRolls, VHARN.id) };
  const token = setup.tokenOf
    ? setup.tokenOf(characters)
    : characterSource(characters, BIA_AT_TABLE.userId);
  const host = createSheetBridgeHost({
    ...{ port: fakes.port, campaignId: VHARN.id, sheet, token, images: api },
    ...{ commands: fakes.commands, characters: fakes.characterCommands, assets: fakes.assets },
    ...{ dice, clock, diceAspect: () => 1, diceTray },
    documents: { library: fakes.library, documents: fakes.documents },
  });
  const frameSends = async (data: unknown): Promise<void> => {
    fakes.port.fromFrame(data);
    await settledHost();
  };
  return { ...fakes, api, clock, characters, sheet, dice, savedRolls, tray, host, frameSends };
}

function sequentialPieceIds(): () => string {
  let next = 0;
  return () => `piece-${(next += 1)}`;
}
