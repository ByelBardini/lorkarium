import { parallaxOffsetOf, type PointerPosition } from '@/lib/parallax-offset';
import type { FrameScheduler } from '@/services/frame-scheduler';
import type { MotionPreference } from '@/services/motion-preference';
import type { ViewportWatch } from '@/services/viewport-watch';

/** The part of `window` the parallax reads; `window` itself satisfies it. */
export interface ParallaxViewport {
  readonly scrollY: number;
  readonly innerWidth: number;
  readonly innerHeight: number;
  addEventListener(type: 'scroll', listener: () => void, options: AddEventListenerOptions): void;
}

export interface HeroParallaxContext {
  viewport: ParallaxViewport;
  frames: FrameScheduler;
  /** `null` when the browser has no `IntersectionObserver`: the hero counts as always on screen. */
  watch: ViewportWatch | null;
  motion: MotionPreference;
}

type ParallaxLayer = HTMLElement | SVGElement;

interface ParallaxRun {
  layers: readonly ParallaxLayer[];
  pointer: PointerPosition;
  queued: boolean;
  inView: boolean;
}

const PASSIVE: AddEventListenerOptions = { passive: true };

/**
 * Moves each `[data-parallax-depth]` of the hero `section#topo` with the scroll and the pointer,
 * writing at most one `transform` per layer per frame through the CSSOM (the CSP refuses `style=`).
 * Example: `startHeroParallax(document, { viewport: window, frames: new AnimationFrameScheduler(), watch: browserViewportWatch(window), motion: new MediaQueryMotionPreference() })`
 */
export function startHeroParallax(root: Document, context: HeroParallaxContext): void {
  const hero = root.querySelector('section#topo');
  const layers = [...(hero?.querySelectorAll<ParallaxLayer>('[data-parallax-depth]') ?? [])];
  if (!hero || layers.length === 0 || context.motion.prefersReduced()) return;
  const run: ParallaxRun = { layers, pointer: { x: 0, y: 0 }, queued: false, inView: true };
  const queue = (): void => queueFrame(run, context);
  context.viewport.addEventListener('scroll', queue, PASSIVE);
  const followPointer = (event: Event): void => {
    run.pointer = pointerOf(event as PointerEvent, context.viewport);
    queue();
  };
  hero.addEventListener('pointermove', followPointer, PASSIVE);
  if (context.watch === null) return queue();
  pauseOffScreen(hero, run, context.watch, queue);
}

function pauseOffScreen(
  hero: Element,
  run: ParallaxRun,
  watch: ViewportWatch,
  queue: () => void,
): void {
  run.inView = false;
  watch.observe(hero, (inView) => {
    run.inView = inView;
    queue();
  });
}

function queueFrame(run: ParallaxRun, context: HeroParallaxContext): void {
  if (run.queued || !run.inView) return;
  run.queued = true;
  context.frames.request(() => {
    run.queued = false;
    paintLayers(run, context.viewport);
  });
}

function paintLayers(run: ParallaxRun, viewport: ParallaxViewport): void {
  for (const layer of run.layers) {
    const { x, y } = parallaxOffsetOf({
      scrollY: viewport.scrollY,
      viewportHeight: viewport.innerHeight,
      depth: Number(layer.dataset.parallaxDepth),
      pointer: run.pointer,
    });
    layer.style.transform = `translate3d(${pixels(x)}px, ${pixels(y)}px, 0px)`;
  }
}

function pointerOf(event: PointerEvent, viewport: ParallaxViewport): PointerPosition {
  return {
    x: (event.clientX / viewport.innerWidth) * 2 - 1,
    y: (event.clientY / viewport.innerHeight) * 2 - 1,
  };
}

function pixels(value: number): string {
  return String(Number(value.toFixed(1)) + 0);
}
