import { describe, expect, it } from 'vitest';
import { tokenRedrawOf } from '@/renderer/token-redraw';
import type { TokenView } from '@/renderer/token-view';
import { goblinView } from '../support/token-view-fixtures';

const NOTHING = { body: false, nameTag: false };
const ART = { url: '/api/assets/a', frame: 'round', flipX: false, flipY: false } as const;

describe('tokenRedrawOf', () => {
  it('a new view with the same fields redraws nothing', () => {
    expect(tokenRedrawOf(goblinView(), goblinView())).toEqual(NOTHING);
  });

  it('a new cell alone redraws nothing: the glide moves the sprite apart', () => {
    expect(tokenRedrawOf(goblinView(), goblinView({ col: 4, row: 2 }))).toEqual(NOTHING);
  });

  it.each<[string, Partial<TokenView>]>([
    [
      'the bar going from 7 to 6',
      { bar: { fraction: 0.6, state: 'normal', excess: 0, color: 'ember' } },
    ],
    ['the facing', { facing: 90 }],
    ['the turn ring', { onTurn: true }],
    ['the defeat cross', { defeated: true }],
    ['the art', { art: ART }],
    ['the silhouette', { silhouette: 'round' }],
    ['a look', { looks: ['invisible'] }],
    ['being hidden from the players', { hidden: true }],
  ])('%s redraws the body only', (_, change) => {
    expect(tokenRedrawOf(goblinView(), goblinView(change))).toEqual({ body: true, nameTag: false });
  });

  it('being selected redraws the body (its ring) and the plate (now shown)', () => {
    expect(tokenRedrawOf(goblinView(), goblinView({ selected: true }))).toEqual({
      body: true,
      nameTag: true,
    });
  });

  it('a new name redraws only the plate', () => {
    expect(tokenRedrawOf(goblinView(), goblinView({ name: 'Goblin chefe' }))).toEqual({
      body: false,
      nameTag: true,
    });
  });

  it('the hover moving onto it redraws only the plate', () => {
    expect(tokenRedrawOf(goblinView(), goblinView(), { hoverChanged: true })).toEqual({
      body: false,
      nameTag: true,
    });
  });

  it('the texture of its art arriving redraws the body', () => {
    const view = goblinView({ art: ART });
    expect(tokenRedrawOf(view, view, { artArrived: true })).toEqual({ body: true, nameTag: false });
  });

  it('new conditions redraw neither: the strip has its own key', () => {
    const poisoned = goblinView({
      conditions: [
        {
          icon: 'skull',
          tone: 'harm',
          color: null,
          remainingRounds: 2,
          stacks: null,
          imageUrl: null,
        },
      ],
    });
    expect(tokenRedrawOf(goblinView(), poisoned)).toEqual(NOTHING);
  });
});
