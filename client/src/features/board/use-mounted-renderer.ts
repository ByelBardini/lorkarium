import { useEffect, useRef, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { ContextLossBudget } from '@/lib/context-loss-budget';
import type {
  BoardIntentListener,
  BoardRenderer,
  CreateBoardRenderer,
} from '@/renderer/board-renderer';
import type { Camera } from '@/renderer/camera';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';

export const BOARD_RELOADED = 'O tabuleiro foi recarregado.';

export type MountedRendererProps = Readonly<{
  createBoardRenderer: CreateBoardRenderer;
  onIntent: BoardIntentListener;
  onRenderer: (renderer: BoardRenderer | null) => void;
  /** Where the "board reloaded" notice goes (the status line). */
  interaction: StoreApi<BoardInteractionStore>;
  /** The clock (ms) of the lost-context budget. */
  lossClock: () => number;
}>;

export type MountedRenderer = Readonly<{
  renderer: BoardRenderer | null;
  failed: boolean;
  /** "Recarregar tabuleiro": forgets the losses and mounts a fresh renderer. */
  retry: () => void;
}>;

/** One mount of the board: `generation` grows on each remount, `camera` is where it opens. */
type MountAttempt = Readonly<{ generation: number; camera: Camera | undefined; failed: boolean }>;

type MountWiring = Readonly<{
  create: CreateBoardRenderer;
  intentRef: React.RefObject<BoardIntentListener>;
  lostRef: React.RefObject<(lost: BoardRenderer) => void>;
  show: (renderer: BoardRenderer | null) => void;
  fail: () => void;
}>;

const FIRST_ATTEMPT: MountAttempt = { generation: 0, camera: undefined, failed: false };

/** One live renderer per mount, destroyed on unmount (StrictMode mounts twice). A lost WebGL
 *  context is caught here, never reaching `onIntent`: the lost renderer is destroyed and a new
 *  one mounts at its camera, up to 3 losses in 60 s; then `failed`, until `retry`.
 *
 *  Example: `const { renderer, failed, retry } = useMountedRenderer(hostRef, props)` */
export function useMountedRenderer(
  hostRef: React.RefObject<HTMLDivElement | null>,
  props: MountedRendererProps,
): MountedRenderer {
  const { createBoardRenderer, onRenderer } = props;
  const [attempt, setAttempt] = useState<MountAttempt>(FIRST_ATTEMPT);
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);
  const [budget] = useState(() => new ContextLossBudget(props.lossClock));
  const intentRef = useLatest(props.onIntent);
  const lostRef = useLatest(lossResponse(budget, props.interaction, setAttempt));
  useEffect(() => {
    const host = hostRef.current;
    if (!host || attempt.failed) return;
    const fail = (): void => setAttempt((now) => ({ ...now, failed: true }));
    const wiring = { create: createBoardRenderer, intentRef, lostRef, show: setRenderer, fail };
    return mountAttempt(host, attempt.camera, wiring);
  }, [createBoardRenderer, hostRef, attempt, intentRef, lostRef]);
  useEffect(() => onRenderer(renderer), [renderer, onRenderer]);
  const retry = (): void => {
    budget.reset();
    setAttempt((now) => ({ ...now, generation: now.generation + 1, failed: false }));
  };
  return { renderer, failed: attempt.failed, retry };
}

// Destroyed even while `mount` is still pending: the adapter finishes init and then tears down.
// Torn down while the renderer chunk still loads: the renderer is destroyed as soon as it comes.
function mountAttempt(
  host: HTMLElement,
  camera: Camera | undefined,
  wiring: MountWiring,
): () => void {
  let alive = true;
  let created: BoardRenderer | null = null;
  const loaded = wiring.create((intent) => {
    if (intent.kind !== 'boardLost') return wiring.intentRef.current(intent);
    if (alive && created) wiring.lostRef.current(created);
  });
  const mounted = loaded.then((renderer) => {
    created = renderer;
    if (!alive) return renderer.destroy();
    return renderer.mount(host, camera ? { camera } : undefined).then(() => {
      if (alive) wiring.show(renderer);
    });
  });
  mounted.catch(() => alive && wiring.fail());
  return () => {
    alive = false;
    created?.destroy();
    wiring.show(null);
  };
}

// The camera is read before anything else: the next renderer opens where the lost one was.
function lossResponse(
  budget: ContextLossBudget,
  interaction: StoreApi<BoardInteractionStore>,
  setAttempt: React.Dispatch<React.SetStateAction<MountAttempt>>,
): (lost: BoardRenderer) => void {
  return (lost) => {
    const camera = lost.camera();
    const failed = budget.recordLoss() === 'give-up';
    if (!failed) interaction.getState().say(BOARD_RELOADED);
    setAttempt((now) => ({ generation: now.generation + 1, camera, failed }));
  };
}

function useLatest<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
