import { useEffect, useMemo, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { announcementOn, type CycleAnnouncementView } from '@/lib/round-cycle-announcements';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useCharacters, type CharactersStore } from '@/stores/characters-store';
import { CyclePhaseImage } from './cycle-phase-image';

/** How long the announcement stays before it goes by itself. */
export const CYCLE_ANNOUNCEMENT_MS = 6000;

export type CycleAnnouncementProps = Readonly<{
  board: StoreApi<BoardStore>;
  characters: StoreApi<CharactersStore>;
}>;

/** The phases a new round brought, over the board of the grid shown, to everyone there (even who
 *  does not see the cycle): "Rodada N começou", each phase's image and name. "Entendi" closes it,
 *  and it goes by itself after 6 s; the next round's shows again.
 *
 *  Example: `<CycleAnnouncement board={table.board} characters={table.characters} />` */
export function CycleAnnouncement({ board, characters }: CycleAnnouncementProps) {
  const sceneId = useBoard(board, (state) => state.board?.scene.id ?? null);
  const announced = useCharacters(characters, (state) => state.announced);
  const view = useMemo(() => announcementOn(announced, sceneId), [announced, sceneId]);
  const [closedKey, setClosedKey] = useState<string | null>(null);
  const shown = view !== null && view.key !== closedKey ? view : null;
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setClosedKey(shown.key), CYCLE_ANNOUNCEMENT_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  if (!shown) return null;
  return <AnnouncementCard view={shown} onClose={() => setClosedKey(shown.key)} />;
}

type CardProps = Readonly<{ view: CycleAnnouncementView; onClose: () => void }>;

function AnnouncementCard({ view, onClose }: CardProps): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/60">
      <div
        role="status"
        aria-label={`Rodada ${view.round} começou`}
        className="pointer-events-auto flex w-[min(30rem,90%)] flex-col items-center gap-3 rounded-md border border-input bg-card px-8 pt-7 pb-5 text-center shadow-2xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
      >
        <span className="text-xs tracking-[0.16em] text-primary uppercase">
          Rodada {view.round} começou
        </span>
        {view.items.map((item) => (
          <div key={item.cycleId} className="flex flex-col items-center gap-2">
            <CyclePhaseImage phase={item.phase} className="size-36" />
            <span className="font-display text-4xl leading-none font-semibold">
              {item.phase.name}
            </span>
            <span className="text-sm text-muted-foreground">{item.cycleName}</span>
          </div>
        ))}
        <Button variant="outline" className="mt-2" onClick={onClose}>
          Entendi
        </Button>
      </div>
    </div>
  );
}
