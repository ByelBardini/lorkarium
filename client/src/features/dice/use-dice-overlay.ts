import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type {
  DiceRenderer,
  DiceRendererFactory,
  DiceRendererRoll,
} from '@/dice-renderer/dice-renderer';
import type { DiceHistoryEntry, DiceHistoryStore } from '@/stores/dice-history-store';
import type { DicePreferencesStore } from '@/stores/dice-preferences-store';
import { useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';

export type DiceOverlayDeps = Readonly<{
  campaignId: string;
  openTables: StoreApi<OpenTablesStore>;
  /** "Dados 3D" on this device. */
  dicePreferences: StoreApi<DicePreferencesStore>;
  createDiceRenderer: DiceRendererFactory;
}>;

/** The renderer born on the first roll that needs it; rolls arriving while three.js loads wait
 *  in `pending`. A factory that fails (no WebGL) leaves the overlay off for this room. */
class LazyDiceRenderer {
  private renderer: DiceRenderer | null = null;
  private loading = false;
  private failed = false;
  private destroyed = false;
  private readonly pending: DiceRendererRoll[] = [];

  constructor(private readonly create: DiceRendererFactory) {}

  show(roll: DiceRendererRoll): void {
    if (this.renderer !== null) return this.renderer.show(roll);
    if (this.failed || this.destroyed) return;
    this.pending.push(roll);
    if (!this.loading) this.load();
  }

  clear(): void {
    this.pending.length = 0;
    this.renderer?.clear();
  }

  destroy(): void {
    this.destroyed = true;
    this.pending.length = 0;
    this.renderer?.destroy();
    this.renderer = null;
  }

  private load(): void {
    this.loading = true;
    this.create().then(
      (renderer) => this.ready(renderer),
      () => {
        this.failed = true;
        this.pending.length = 0;
      },
    );
  }

  private ready(renderer: DiceRenderer): void {
    if (this.destroyed) return renderer.destroy();
    this.renderer = renderer;
    this.pending.splice(0).forEach((roll) => renderer.show(roll));
  }
}

function rendererRollOf(entry: DiceHistoryEntry): DiceRendererRoll | null {
  if (entry.kind !== 'rolled' || entry.event.throw === null) return null;
  const { rollId, throw: diceThrow, appearance } = entry.event;
  return { rollId, throw: diceThrow, appearance };
}

/** Rolls each new visible roll of the open table in 3D over the window, the same throw for
 *  everyone. Nothing loads while "Dados 3D" is off, and turning it off drops the dice on
 *  screen; a secret notice or a roll without modeled dice (`throw: null`) never reaches the
 *  renderer. Leaving the room destroys it.
 *
 *  Example: `useDiceOverlay({ campaignId: campaign.id, openTables, dicePreferences, createDiceRenderer })` */
export function useDiceOverlay(deps: DiceOverlayDeps): void {
  const { campaignId, openTables, dicePreferences, createDiceRenderer } = deps;
  const history = useOpenTables(
    openTables,
    (state) => state.tables.find((table) => table.campaignId === campaignId)?.dice ?? null,
  );
  useEffect(() => {
    if (history === null) return;
    return overlayOn(history, dicePreferences, new LazyDiceRenderer(createDiceRenderer));
  }, [history, dicePreferences, createDiceRenderer]);
}

function overlayOn(
  history: StoreApi<DiceHistoryStore>,
  preferences: StoreApi<DicePreferencesStore>,
  renderer: LazyDiceRenderer,
): () => void {
  const stopHearing = history.getState().onNewEntry((entry) => {
    const roll = rendererRollOf(entry);
    if (roll !== null && preferences.getState().threeD) renderer.show(roll);
  });
  const stopWatching = preferences.subscribe((state, previous) => {
    if (previous.threeD && !state.threeD) renderer.clear();
  });
  return () => {
    stopHearing();
    stopWatching();
    renderer.destroy();
  };
}
