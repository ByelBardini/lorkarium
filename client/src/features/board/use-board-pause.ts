import { useEffect } from 'react';
import type { BoardRenderer } from '@/renderer/board-renderer';

/** While `covered` (a document over the whole board), the renderer draws nothing; uncovered, or
 *  a new renderer mounted, it draws again.
 *
 *  Example: `useBoardPause(renderer, !!activeDocument)` */
export function useBoardPause(renderer: BoardRenderer | null, covered: boolean): void {
  useEffect(() => {
    if (!renderer || !covered) return;
    renderer.pause();
    return () => renderer.resume();
  }, [renderer, covered]);
}
