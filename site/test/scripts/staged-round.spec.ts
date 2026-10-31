import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import { landingCopy, type CombatantCopy, type EncounterCopy } from '@/copy/landing-copy';
import { hpFillOf } from '@/lib/hit-points';
import { startStagedRound } from '@/scripts/staged-round';
import { MotionPreferenceFake } from '../support/motion-preference-fake';
import { StepTimerFake } from '../support/step-timer-fake';
import { ViewportWatchFake } from '../support/viewport-watch-fake';

const STEP_MS = 1_900;
const OGRE = 3;
const THOREN = 4;

let document: Document;
let timer: StepTimerFake;
let watch: ViewportWatchFake;

function conditionHtml({ name, rounds }: CombatantCopy['conditions'][number]): string {
  const roundsHtml = rounds === null ? '' : `<span data-condition-rounds>${rounds}</span>`;
  return `<span data-condition="${name}">${name} ${roundsHtml}</span>`;
}

function rowHtml(combatant: CombatantCopy, index: number): string {
  const current = combatant.hasTurn ? ' aria-current="true"' : '';
  const width = hpFillOf(combatant.hp, combatant.maxHp);
  return `<li data-combatant="${index}"${current}>
    <b>${combatant.name}</b>${combatant.conditions.map(conditionHtml).join('')}
    <span data-combatant-hp>${combatant.hp} / ${combatant.maxHp}</span>
    <svg viewBox="0 0 100 6"><rect data-hp-fill width="${width}" height="6"></rect></svg>
    <span data-combatant-down hidden>Caído</span>
  </li>`;
}

function trackerHtml(encounter: EncounterCopy): string {
  const turn = encounter.combatants.find((combatant) => combatant.hasTurn)?.name ?? '';
  return `<div data-encounter-tracker>
    <p>Rodada <span data-encounter-round>${encounter.round}</span></p>
    <p>Vez de <span data-encounter-turn aria-live="polite">${turn}</span></p>
    <button type="button" data-round-pause hidden aria-pressed="false">Pausar</button>
    <ol>${encounter.combatants.map(rowHtml).join('')}</ol>
  </div>`;
}

function one(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`${selector} is missing: expected it in the tracker HTML`);
  return element;
}

function textOf(selector: string): string | null {
  return one(selector).textContent;
}

function row(index: number): HTMLElement {
  return one(`li[data-combatant="${index}"]`);
}

function start(
  motion = new MotionPreferenceFake(),
  encounter: EncounterCopy = landingCopy.encounter,
): void {
  document = new JSDOM(trackerHtml(encounter)).window.document;
  startStagedRound(document, { encounter, timer, watch, motion });
}

function enterAndPlay(steps: number): void {
  watch.enter(one('[data-encounter-tracker]'));
  timer.advance(steps * STEP_MS);
}

describe('startStagedRound', () => {
  beforeEach(() => {
    timer = new StepTimerFake();
    watch = new ViewportWatchFake();
  });

  it('with the tracker on screen, the turn passes to Thoren after one step', () => {
    start();

    enterAndPlay(1);

    expect(textOf('[data-encounter-turn]')).toBe('Thoren');
    expect(row(THOREN).getAttribute('aria-current')).toBe('true');
    expect(row(OGRE).hasAttribute('aria-current')).toBe(false);
    expect(row(THOREN).querySelector('[data-condition-rounds]')?.textContent).toBe('7');
  });

  it('a step only happens after the full ~1900 ms', () => {
    start();
    watch.enter(one('[data-encounter-tracker]'));

    timer.advance(STEP_MS - 1);

    expect(textOf('[data-encounter-turn]')).toBe('Ogro das Cinzas');
  });

  it('a tracker that never came on screen does not play', () => {
    start();

    timer.advance(10 * STEP_MS);

    expect(textOf('[data-encounter-turn]')).toBe('Ogro das Cinzas');
    expect(timer.pending).toBe(0);
  });

  it('leaving the screen stops the round where it was', () => {
    start();
    enterAndPlay(1);

    watch.leave(one('[data-encounter-tracker]'));
    timer.advance(10 * STEP_MS);

    expect(textOf('[data-encounter-turn]')).toBe('Thoren');
  });

  it('on the Kael step the Ogre bar shows 29 of 68 in round 4', () => {
    start();

    enterAndPlay(4);

    expect(textOf('[data-encounter-round]')).toBe('4');
    expect(row(OGRE).querySelector('[data-combatant-hp]')?.textContent).toBe('29 / 68');
    expect(row(OGRE).querySelector('rect[data-hp-fill]')?.getAttribute('width')).toBe('42.6');
  });

  it('a condition that runs out is hidden, and the loop brings it back', () => {
    start();
    enterAndPlay(10);
    expect(one('[data-condition="Envenenado"]').hidden).toBe(true);

    timer.advance(STEP_MS);

    expect(one('[data-condition="Envenenado"]').hidden).toBe(false);
    expect(one('[data-condition="Envenenado"] [data-condition-rounds]').textContent).toBe('2');
    expect(textOf('[data-encounter-round]')).toBe('3');
    expect(row(OGRE).querySelector('[data-combatant-hp]')?.textContent).toBe('41 / 68');
  });

  it('a combatant at 0 hit points shows the down mark', () => {
    const weakOgre = {
      ...landingCopy.encounter,
      combatants: landingCopy.encounter.combatants.map((combatant, index) =>
        index === OGRE ? { ...combatant, hp: 5 } : combatant,
      ),
    };
    start(new MotionPreferenceFake(), weakOgre);

    enterAndPlay(4);

    expect(row(OGRE).querySelector('[data-combatant-hp]')?.textContent).toBe('0 / 68');
    expect(row(OGRE).querySelector('rect[data-hp-fill]')?.getAttribute('width')).toBe('0.0');
    expect(row(OGRE).querySelector<HTMLElement>('[data-combatant-down]')?.hidden).toBe(false);
    expect(row(THOREN).querySelector<HTMLElement>('[data-combatant-down]')?.hidden).toBe(true);
  });

  it('the pause button stops the round, turns into Continue and resumes on a second press', () => {
    start();
    enterAndPlay(1);
    const pause = one('button[data-round-pause]');
    expect(pause.hidden).toBe(false);

    pause.click();
    timer.advance(5 * STEP_MS);
    expect(pause.getAttribute('aria-pressed')).toBe('true');
    expect(pause.textContent).toBe('Continuar');
    expect(textOf('[data-encounter-turn]')).toBe('Thoren');

    pause.click();
    timer.advance(STEP_MS);
    expect(pause.getAttribute('aria-pressed')).toBe('false');
    expect(pause.textContent).toBe('Pausar');
    expect(textOf('[data-encounter-turn]')).toBe('Lyra');
  });

  it('with reduced motion the tracker stays still at the start, without the pause button', () => {
    start(new MotionPreferenceFake().reduce());

    timer.advance(10 * STEP_MS);

    expect(watch.watched).toEqual([]);
    expect(one('button[data-round-pause]').hidden).toBe(true);
    expect(textOf('[data-encounter-turn]')).toBe('Ogro das Cinzas');
  });

  it('a browser without IntersectionObserver keeps the tracker still', () => {
    document = new JSDOM(trackerHtml(landingCopy.encounter)).window.document;
    const motion = new MotionPreferenceFake();
    startStagedRound(document, { encounter: landingCopy.encounter, timer, watch: null, motion });

    timer.advance(10 * STEP_MS);

    expect(one('button[data-round-pause]').hidden).toBe(true);
    expect(timer.pending).toBe(0);
  });

  it('playing the whole script never writes a style attribute', () => {
    start();

    enterAndPlay(11);

    expect(document.querySelectorAll('[style]')).toHaveLength(0);
  });
});
