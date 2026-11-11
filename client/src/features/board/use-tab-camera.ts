import { useLayoutEffect, useRef, useState } from 'react';
import type { BoardRenderer } from '@/renderer/board-renderer';
import type { Camera } from '@/renderer/camera';

type ShownOn = Readonly<{ renderer: BoardRenderer | null; tabKey: string }>;

/** One renderer for every grid tab: when the tab shown changes, the camera of the tab left is
 *  kept and the renderer resets to the camera of the tab shown (none yet: it fits the scene).
 *  A new renderer (the first, or one after a lost context) opens as its mount says.
 *
 *  Example: `useTabCamera(renderer, tabKey)` */
export function useTabCamera(renderer: BoardRenderer | null, tabKey: string): void {
  const [cameras] = useState(() => new Map<string, Camera>());
  const shownOn = useRef<ShownOn>({ renderer, tabKey });
  // Before the passive effects: the new tab's `draw` must find the scene reset, and a drag
  // cancelled by the reset still reaches the listener of the tab it started on.
  useLayoutEffect(() => {
    const before = shownOn.current;
    shownOn.current = { renderer, tabKey };
    if (!renderer || before.renderer !== renderer || before.tabKey === tabKey) return;
    cameras.set(before.tabKey, renderer.camera());
    const camera = cameras.get(tabKey);
    renderer.resetScene(camera ? { camera } : undefined);
  }, [cameras, renderer, tabKey]);
}
