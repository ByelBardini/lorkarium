import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';

/** How long the balloon stays by the cursor. */
export const REFUSAL_BALLOON_MS = 4000;

type Point = Readonly<{ x: number; y: number }>;
type Shown = Readonly<{ text: string; at: Point }>;

/** Why the server refused this viewer's last command (a light past the plan, a wall…), in a
 *  balloon by the cursor where the click was, for a few seconds: nobody reads the status line
 *  in the corner. It is visual only; the status line stays the polite voice.
 *
 *  Example: `<BoardRefusalBalloon interaction={interaction} />` */
export function BoardRefusalBalloon({
  interaction,
}: Readonly<{ interaction: StoreApi<BoardInteractionStore> }>): React.JSX.Element | null {
  const shown = useRefusalByPointer(interaction);
  if (!shown) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="board-refusal-balloon"
      style={{ left: shown.at.x + 14, top: shown.at.y + 14 }}
      className="pointer-events-none fixed z-50 max-w-72 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg"
    >
      {shown.text}
    </div>
  );
}

// The refusal arrives after the click, by the server's answer: the pointer is read then.
function useRefusalByPointer(interaction: StoreApi<BoardInteractionStore>): Shown | null {
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    let at: Point = { x: 0, y: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const follow = (event: PointerEvent): void => {
      at = { x: event.clientX, y: event.clientY };
    };
    const stopListening = interaction.subscribe((state, before) => {
      if (!state.refusal || state.refusal === before.refusal) return;
      setShown({ text: state.refusal.text, at });
      clearTimeout(timer);
      timer = setTimeout(() => setShown(null), REFUSAL_BALLOON_MS);
    });
    window.addEventListener('pointermove', follow);
    window.addEventListener('pointerdown', follow);
    return () => {
      stopListening();
      clearTimeout(timer);
      window.removeEventListener('pointermove', follow);
      window.removeEventListener('pointerdown', follow);
    };
  }, [interaction]);
  return shown;
}
