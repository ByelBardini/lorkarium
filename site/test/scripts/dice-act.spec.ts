import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import { recordedThrowsOf, type RecordedThrow } from '@/lib/recorded-throws';
import { startDiceAct } from '@/scripts/dice-act';
import { DiceRendererLoaderFake } from '../support/dice-renderer-fake';
import { MotionPreferenceFake } from '../support/motion-preference-fake';
import { StepTimerFake } from '../support/step-timer-fake';
import { UnitRandomFake } from '../support/unit-random-fake';
import { ViewportWatchFake } from '../support/viewport-watch-fake';

// The versioned recording: throw 0 shows a 17 and settles at 2400 ms, throw 1 a 20 (`pnpm --filter @lorkarium/server dice:record` rewrites both: update them).
const THROWS: RecordedThrow[] = recordedThrowsOf(
  JSON.parse(readFileSync(new URL('../../src/assets/dice/throws.json', import.meta.url), 'utf8')),
);
const FIRST_SETTLE_MS = 2_400;

const STAGE_HTML = `<div data-dice-stage>
  <img data-dice-poster alt="Rolagem de dados 3D">
  <button type="button" data-dice-roll hidden>Rolar o d20</button>
  <span data-dice-total aria-live="polite"></span>
</div>`;

let document: Document;
let watch: ViewportWatchFake;
let motion: MotionPreferenceFake;
let timer: StepTimerFake;
let loader: DiceRendererLoaderFake;

function stage(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-dice-stage]');
  if (!element) throw new Error('No [data-dice-stage] in the page: expected the act V markup');
  return element;
}

function rollButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('[data-dice-roll]');
  if (!button) throw new Error('No [data-dice-roll] in the page: expected the act V markup');
  return button;
}

function totalText(): string {
  return document.querySelector('[data-dice-total]')?.textContent ?? '';
}

function poster(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-dice-poster]');
}

function start(random: number[] = [0, 0]): void {
  startDiceAct(document, {
    loadDice: loader.load,
    watch,
    motion,
    timer,
    random: new UnitRandomFake(random).next,
  });
}

async function enterAndLoad(): Promise<void> {
  watch.enter(stage());
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  document = new JSDOM(`<body>${STAGE_HTML}</body>`).window.document;
  watch = new ViewportWatchFake();
  motion = new MotionPreferenceFake();
  timer = new StepTimerFake();
  loader = new DiceRendererLoaderFake(THROWS);
});

describe('startDiceAct', () => {
  it('loads the renderer only when the stage comes into view', async () => {
    start();

    expect(loader.loads).toBe(0);
    await enterAndLoad();
    expect(loader.stages).toEqual([stage()]);
  });

  it('plays a recorded throw, hides the poster and shows the roll button', async () => {
    start();
    await enterAndLoad();

    expect(loader.renderer.played.map((roll) => roll.throw)).toEqual([THROWS[0]?.throw]);
    expect(poster()?.hidden).toBe(true);
    expect(rollButton().hidden).toBe(false);
  });

  it('writes the total once the dice settle, not before', async () => {
    start();
    await enterAndLoad();

    timer.advance(FIRST_SETTLE_MS - 1);
    expect(totalText()).toBe('');
    timer.advance(1);
    expect(totalText()).toBe('Total 17');
  });

  it('keeps the button disabled while the dice roll', async () => {
    start();
    await enterAndLoad();

    expect(rollButton().disabled).toBe(true);
    timer.advance(FIRST_SETTLE_MS);
    expect(rollButton().disabled).toBe(false);
  });

  it('"Rolar o d20" plays another throw, never the same one twice in a row', async () => {
    start([0, 0]);
    await enterAndLoad();
    timer.advance(FIRST_SETTLE_MS);

    rollButton().click();

    const shown = loader.renderer.played.map((roll) => roll.throw);
    expect(shown).toEqual([THROWS[0]?.throw, THROWS[1]?.throw]);
    expect(new Set(loader.renderer.played.map((roll) => roll.rollId)).size).toBe(2);
  });

  it('loads the renderer once, however many times the stage comes back into view', async () => {
    start();
    await enterAndLoad();
    watch.leave(stage());
    await enterAndLoad();

    expect(loader.loads).toBe(1);
  });

  it('leaving the view mid-roll clears the dice and drops the pending total', async () => {
    start();
    await enterAndLoad();

    watch.leave(stage());
    timer.advance(FIRST_SETTLE_MS);

    expect(loader.renderer.clears).toBe(1);
    expect(totalText()).toBe('');
    expect(rollButton().disabled).toBe(false);
  });

  it('without WebGL the poster stays and the button stays hidden, with no error', async () => {
    loader.refuse();
    start();
    await enterAndLoad();

    expect(poster()?.hidden).toBe(false);
    expect(rollButton().hidden).toBe(true);
  });

  it('with reduced motion nothing loads and the poster stays', async () => {
    motion.reduce();
    start();

    expect(watch.watched).toEqual([]);
    expect(loader.loads).toBe(0);
    expect(rollButton().hidden).toBe(true);
  });

  it('without IntersectionObserver nothing loads and the poster stays', () => {
    startDiceAct(document, {
      loadDice: loader.load,
      watch: null,
      motion,
      timer,
      random: new UnitRandomFake([0]).next,
    });

    expect(loader.loads).toBe(0);
    expect(poster()?.hidden).toBe(false);
  });
});
