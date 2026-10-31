import type { DiceAppearanceDto } from '@lorkarium/contracts';
import type { DiceRenderer } from '@lorkarium/dice-renderer';
import { pickThrow, throwSettleMsOf, throwTotalOf } from '@/lib/recorded-throw-play';
import type { RecordedThrow } from '@/lib/recorded-throws';
import type { MotionPreference } from '@/services/motion-preference';
import type { CancelStep, StepTimer } from '@/services/step-timer';
import type { ViewportWatch } from '@/services/viewport-watch';

/** What the lazy load brings: the renderer in the stage and the recorded throws it plays. */
export interface LoadedDice {
  renderer: DiceRenderer;
  throws: readonly RecordedThrow[];
}

export interface DiceActContext {
  /** The lazy `import()` of the renderer and the recording; rejects without WebGL. */
  loadDice: (stage: HTMLElement) => Promise<LoadedDice>;
  watch: ViewportWatch | null;
  motion: MotionPreference;
  timer: StepTimer;
  random: () => number;
}

/** The ember of the brand, the colour of the landing's d20. */
export const LANDING_DICE_APPEARANCE: DiceAppearanceDto = {
  color: 'ember',
  textureId: null,
  numberColor: null,
};

interface DiceStage {
  stage: HTMLElement;
  button: HTMLButtonElement;
  total: HTMLElement;
  poster: HTMLElement | null;
}

/**
 * Act V: when the stage comes into view, loads the 3D dice (once) and plays a throw recorded by
 * the server's physics; "Rolar o d20" plays another and the total appears once the dice settle.
 * Without WebGL, IntersectionObserver or with reduced motion the poster simply stays.
 * Example: `startDiceAct(document, { loadDice, watch, motion, timer, random })`
 */
export function startDiceAct(root: Document, context: DiceActContext): void {
  const parts = diceStageOf(root);
  if (!parts || !context.watch || context.motion.prefersReduced()) return;
  const act = new DiceAct(parts, context);
  context.watch.observe(parts.stage, (inView) => act.setInView(inView));
  parts.button.addEventListener('click', () => act.roll());
}

function diceStageOf(root: Document): DiceStage | null {
  const stage = root.querySelector<HTMLElement>('[data-dice-stage]');
  const button = stage?.querySelector<HTMLButtonElement>('[data-dice-roll]');
  const total = stage?.querySelector<HTMLElement>('[data-dice-total]');
  if (!stage || !button || !total) return null;
  return { stage, button, total, poster: stage.querySelector<HTMLElement>('[data-dice-poster]') };
}

class DiceAct {
  private renderer: DiceRenderer | null = null;
  private throws: readonly RecordedThrow[] = [];
  private loading = false;
  private inView = false;
  private lastIndex: number | null = null;
  private rolls = 0;
  private cancelTotal: CancelStep | null = null;

  constructor(
    private readonly parts: DiceStage,
    private readonly context: DiceActContext,
  ) {}

  setInView(inView: boolean): void {
    this.inView = inView;
    if (!inView) return this.stop();
    if (this.renderer) return this.roll();
    this.load();
  }

  roll(): void {
    if (!this.renderer || !this.inView) return;
    const pick = pickThrow(this.throws, this.context.random, this.lastIndex);
    this.lastIndex = pick.index;
    this.rolls += 1;
    this.renderer.show({
      rollId: `landing-d20-${this.rolls}`,
      throw: pick.recorded.throw,
      appearance: LANDING_DICE_APPEARANCE,
    });
    this.awaitTotal(pick.recorded);
  }

  private load(): void {
    if (this.loading) return;
    this.loading = true;
    this.context
      .loadDice(this.parts.stage)
      .then((loaded) => this.ready(loaded))
      .catch(() => undefined);
  }

  private ready({ renderer, throws }: LoadedDice): void {
    this.renderer = renderer;
    this.throws = throws;
    if (this.parts.poster) this.parts.poster.hidden = true;
    this.parts.stage.dataset.diceLive = '';
    this.parts.button.hidden = false;
    this.roll();
  }

  private awaitTotal(recorded: RecordedThrow): void {
    this.cancelTotal?.();
    this.parts.total.textContent = '';
    this.parts.button.disabled = true;
    this.cancelTotal = this.context.timer.after(throwSettleMsOf(recorded), () => {
      this.parts.total.textContent = `Total ${throwTotalOf(recorded)}`;
      this.parts.button.disabled = false;
      this.cancelTotal = null;
    });
  }

  private stop(): void {
    this.renderer?.clear();
    this.cancelTotal?.();
    this.cancelTotal = null;
    this.parts.button.disabled = false;
  }
}
