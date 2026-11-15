import type { SavedRollDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  EMPTY_TRAY_CHOICE,
  chooseMode,
  clearTray,
  withTray,
  type DiceRollMode,
  type DiceTray,
  type TrayChoice,
} from '@/lib/dice-tray';
import {
  addPiece,
  addSavedRoll,
  removePiece,
  trayPartCountOf,
  type TrayPieceAsk,
} from '@/lib/dice-tray-pieces';

export type DiceTrayStore = Readonly<{
  choice: TrayChoice;
  /** The whole choice as the "Dados" tab edits it (formula, mode, "Quem vê"). */
  setChoice: (choice: TrayChoice) => void;
  /** Answers `false` when the tray is full (10 parts); an unreadable piece is a `RangeError`. */
  addPiece: (ask: TrayPieceAsk) => boolean;
  /** Answers `false` when the saved roll does not fit whole. */
  addSavedRoll: (saved: SavedRollDto) => boolean;
  removePiece: (pieceId: string) => void;
  chooseMode: (mode: DiceRollMode) => void;
  /** The next roll starts over: empty, Normal, "Quem vê" kept. */
  clear: () => void;
  /** Parts the tray rolls now (the tab's badge). */
  partCount: () => number;
}>;

/** The open tables of this tab, as far as the trays need: which ones are still open. */
export type TableOpenings = Readonly<{
  getState(): Readonly<{ tables: readonly Readonly<{ campaignId: string }>[] }>;
  subscribe(
    listener: (state: Readonly<{ tables: readonly Readonly<{ campaignId: string }>[] }>) => void,
  ): () => void;
}>;

// One tray per open table, shared by the "Dados" tab and the sheet bridge (which lives outside
// the panel's tree and must write in it). Keyed by the injected open tables, so each test starts
// empty and a table closed in this tab takes its tray along.
const TRAYS = new WeakMap<TableOpenings, Map<string, StoreApi<DiceTrayStore>>>();

/** The tray being built at one open table, the same store for the panel and the sheet.
 *
 *  Example: `diceTrayStoreOf(deps.openTables, campaignId).getState().addSavedRoll(acerto)` */
export function diceTrayStoreOf(
  openTables: TableOpenings,
  campaignId: string,
  newId: () => string = () => crypto.randomUUID(),
): StoreApi<DiceTrayStore> {
  const byTable = traysOf(openTables);
  const known = byTable.get(campaignId);
  if (known) return known;
  const created = createDiceTrayStore(newId);
  byTable.set(campaignId, created);
  return created;
}

/** A selector over one table's tray.
 *
 *  Example: `const count = useDiceTray(tray, (state) => state.partCount())` */
export function useDiceTray<T>(
  store: StoreApi<DiceTrayStore>,
  selector: (state: DiceTrayStore) => T,
): T {
  return useStore(store, selector);
}

/** How many parts the tray holds now; `null` (no tray: a spectator, or a tab without one) is 0.
 *  Safe to call from every tab of a list, since the hook is always called.
 *
 *  Example: `const parts = useDiceTrayPartCount(diceTray)` */
export function useDiceTrayPartCount(store: StoreApi<DiceTrayStore> | null): number {
  return useStore(store ?? NO_TRAY, (state) => state.partCount());
}

const NO_TRAY = createDiceTrayStore(() => '');

function traysOf(openTables: TableOpenings): Map<string, StoreApi<DiceTrayStore>> {
  const known = TRAYS.get(openTables);
  if (known) return known;
  const byTable = new Map<string, StoreApi<DiceTrayStore>>();
  TRAYS.set(openTables, byTable);
  openTables.subscribe((state) => forgetClosed(byTable, state.tables));
  return byTable;
}

function forgetClosed(
  byTable: Map<string, StoreApi<DiceTrayStore>>,
  tables: readonly Readonly<{ campaignId: string }>[],
): void {
  for (const [campaignId, store] of byTable) {
    if (tables.some((table) => table.campaignId === campaignId)) continue;
    store.getState().setChoice(EMPTY_TRAY_CHOICE);
    byTable.delete(campaignId);
  }
}

function createDiceTrayStore(newId: () => string): StoreApi<DiceTrayStore> {
  return createStore<DiceTrayStore>((set, get) => {
    const editTray = (next: DiceTray): boolean => {
      const { choice } = get();
      if (next === choice.tray) return false;
      set({ choice: withTray(choice, next) });
      return true;
    };
    return {
      choice: EMPTY_TRAY_CHOICE,
      setChoice: (choice) => set({ choice }),
      addPiece: (ask) => editTray(addPiece(get().choice.tray, ask, newId)),
      addSavedRoll: (saved) => editTray(addSavedRoll(get().choice.tray, saved, newId)),
      removePiece: (pieceId) => void editTray(removePiece(get().choice.tray, pieceId)),
      chooseMode: (mode) => set({ choice: chooseMode(get().choice, mode) }),
      clear: () => set({ choice: clearTray(get().choice) }),
      partCount: () => trayPartCountOf(get().choice.tray),
    };
  });
}
