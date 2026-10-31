import type { EncounterCopy } from '@/copy/landing-copy';
import {
  initialEncounterState,
  nextEncounterStep,
  type CombatantState,
  type EncounterState,
} from '@/lib/encounter-round';
import { hpFillOf } from '@/lib/hit-points';
import type { MotionPreference } from '@/services/motion-preference';
import type { CancelStep, StepTimer } from '@/services/step-timer';
import type { ViewportWatch } from '@/services/viewport-watch';

export interface StagedRoundContext {
  /** The same copy the tracker component rendered, so the first step starts from what is shown. */
  encounter: EncounterCopy;
  timer: StepTimer;
  /** `null` when the browser has no `IntersectionObserver`: the tracker then stays still. */
  watch: ViewportWatch | null;
  motion: MotionPreference;
}

export const STAGED_STEP_MS = 1_900;

const PAUSE_LABEL = 'Pausar';
const RESUME_LABEL = 'Continuar';

/**
 * Plays the scripted round on `[data-encounter-tracker]` while it is on screen, with a pause
 * button (WCAG 2.2.2); with reduced motion or no observer it stays at the initial state.
 * Example: `startStagedRound(document, { encounter: landingCopy.encounter, timer: new TimeoutStepTimer(), watch: browserViewportWatch(window), motion: new MediaQueryMotionPreference() })`
 */
export function startStagedRound(root: Document, context: StagedRoundContext): void {
  const tracker = root.querySelector<HTMLElement>('[data-encounter-tracker]');
  if (!tracker || context.watch === null || context.motion.prefersReduced()) return;
  const player = new StagedRoundPlayer(tracker, context.timer, context.encounter);
  const pause = tracker.querySelector<HTMLButtonElement>('button[data-round-pause]');
  if (pause) wirePauseButton(pause, player);
  context.watch.observe(tracker, (inView) => player.setInView(inView));
}

function wirePauseButton(button: HTMLButtonElement, player: StagedRoundPlayer): void {
  button.hidden = false;
  button.addEventListener('click', () => {
    const paused = player.togglePaused();
    button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? RESUME_LABEL : PAUSE_LABEL;
  });
}

class StagedRoundPlayer {
  private readonly initial: EncounterState;
  private current: EncounterState;
  private inView = false;
  private paused = false;
  private cancelStep: CancelStep | null = null;

  constructor(
    private readonly tracker: HTMLElement,
    private readonly timer: StepTimer,
    encounter: EncounterCopy,
  ) {
    this.initial = initialEncounterState(encounter);
    this.current = this.initial;
  }

  setInView(inView: boolean): void {
    this.inView = inView;
    this.reschedule();
  }

  togglePaused(): boolean {
    this.paused = !this.paused;
    this.reschedule();
    return this.paused;
  }

  private reschedule(): void {
    this.cancelStep?.();
    this.cancelStep = null;
    if (!this.inView || this.paused) return;
    this.cancelStep = this.timer.after(STAGED_STEP_MS, () => this.playStep());
  }

  private playStep(): void {
    this.current = nextEncounterStep(this.current, this.initial);
    renderEncounter(this.tracker, this.current);
    this.reschedule();
  }
}

function renderEncounter(tracker: HTMLElement, state: EncounterState): void {
  setText(tracker.querySelector('[data-encounter-round]'), String(state.round));
  setText(tracker.querySelector('[data-encounter-turn]'), state.combatants[state.turnIndex]?.name);
  for (const row of tracker.querySelectorAll<HTMLElement>('li[data-combatant]')) {
    const index = Number(row.dataset.combatant);
    const combatant = state.combatants[index];
    if (combatant) renderCombatant(row, combatant, index === state.turnIndex);
  }
}

function renderCombatant(row: HTMLElement, combatant: CombatantState, hasTurn: boolean): void {
  if (hasTurn) row.setAttribute('aria-current', 'true');
  else row.removeAttribute('aria-current');
  setText(row.querySelector('[data-combatant-hp]'), `${combatant.hp} / ${combatant.maxHp}`);
  row
    .querySelector('rect[data-hp-fill]')
    ?.setAttribute('width', hpFillOf(combatant.hp, combatant.maxHp));
  const down = row.querySelector<HTMLElement>('[data-combatant-down]');
  if (down) down.hidden = combatant.hp > 0;
  for (const badge of row.querySelectorAll<HTMLElement>('[data-condition]')) {
    renderCondition(badge, combatant);
  }
}

function renderCondition(badge: HTMLElement, combatant: CombatantState): void {
  const condition = combatant.conditions.find(({ name }) => name === badge.dataset.condition);
  badge.hidden = condition === undefined;
  if (condition?.rounds == null) return;
  setText(badge.querySelector('[data-condition-rounds]'), String(condition.rounds));
}

// Rewriting an unchanged text would make the aria-live turn announce itself again.
function setText(element: Element | null, text: string | undefined): void {
  if (!element || text === undefined || element.textContent === text) return;
  element.textContent = text;
}
