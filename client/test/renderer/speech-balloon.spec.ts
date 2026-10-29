import { describe, expect, it } from 'vitest';
import type { TokenView } from '@/renderer/token-view';
import {
  clippedSpeechText,
  shownSpeechOf,
  speechAnchorOf,
  speechExpired,
  type SpeechBalloon,
} from '@/renderer/speech-balloon';
import { goblinView } from '../support/token-view-fixtures';

const SCENE = 'scene-1';

function balloon(overrides: Partial<SpeechBalloon> = {}): SpeechBalloon {
  return {
    id: 'm1',
    sceneId: SCENE,
    tokenId: 'goblin',
    speakerName: 'Goblin',
    text: 'Quem vem lá?',
    shownAt: 1000,
    ...overrides,
  };
}

function tokensOf(...views: TokenView[]): ReadonlyMap<string, TokenView> {
  return new Map(views.map((view) => [view.id, view]));
}

function shownAt(
  nowMs: number,
  balloons: readonly SpeechBalloon[],
  tokens = tokensOf(goblinView()),
) {
  return shownSpeechOf({ sceneId: SCENE, balloons, tokens, nowMs });
}

describe('clippedSpeechText', () => {
  it('a line of up to 80 characters is kept whole', () => {
    const line = 'a'.repeat(80);

    expect(clippedSpeechText(line)).toBe(line);
  });

  it('a line past 80 characters is cut to 79 plus "…", 80 in all', () => {
    const clipped = clippedSpeechText(`${'b'.repeat(79)}cdef`);

    expect(clipped).toBe(`${'b'.repeat(79)}…`);
  });

  it('the cut never leaves a space before the "…"', () => {
    const clipped = clippedSpeechText(`${'c'.repeat(78)} defgh`);

    expect(clipped).toBe(`${'c'.repeat(78)}…`);
  });

  it('counts characters, not UTF-16 units: an emoji at the cut is not split in half', () => {
    const clipped = clippedSpeechText(`${'🐉'.repeat(85)}`);

    expect(clipped).toBe(`${'🐉'.repeat(79)}…`);
  });

  it('spaces around the line are trimmed and inner line breaks become one space', () => {
    expect(clippedSpeechText('  Alto lá!\n\nQuem vem?  ')).toBe('Alto lá! Quem vem?');
  });
});

describe('speechExpired', () => {
  it('a balloon lives 4.5 s: at 4499 ms it is still up, at 4500 ms it is gone', () => {
    const said = balloon({ shownAt: 1000 });

    expect([speechExpired(said, 5499), speechExpired(said, 5500)]).toEqual([false, true]);
  });

  it('a balloon stamped a bit ahead of the clock still shows', () => {
    expect(speechExpired(balloon({ shownAt: 2000 }), 1500)).toBe(false);
  });
});

describe('shownSpeechOf', () => {
  it('a live balloon over a seen token shows with its text and the token footprint', () => {
    const shown = shownAt(1100, [balloon()]);

    expect(shown).toEqual([
      {
        id: 'm1',
        tokenId: 'goblin',
        speakerName: 'Goblin',
        text: 'Quem vem lá?',
        token: { col: 0, row: 0, width: 1, height: 1 },
      },
    ]);
  });

  it('the shown text is the clipped one', () => {
    const [shown] = shownAt(1100, [balloon({ text: 'x'.repeat(100) })]);

    expect(shown?.text).toBe(`${'x'.repeat(79)}…`);
  });

  it('an expired balloon is not shown', () => {
    expect(shownAt(5500, [balloon({ shownAt: 1000 })])).toEqual([]);
  });

  it('the newest balloon of the same token replaces the older one, whatever the list order', () => {
    const newer = balloon({ id: 'm2', text: 'Corram!', shownAt: 2000 });
    const older = balloon({ id: 'm1', text: 'Quem vem lá?', shownAt: 1000 });

    const shown = shownAt(2100, [newer, older]);

    expect(shown.map(({ id }) => id)).toEqual(['m2']);
  });

  it('balloons of different tokens all show, the oldest first (the newest drawn on top)', () => {
    const tokens = tokensOf(goblinView(), goblinView({ id: 'orc', col: 3 }));
    const orc = balloon({ id: 'm2', tokenId: 'orc', shownAt: 1500 });

    const shown = shownAt(1600, [orc, balloon({ shownAt: 1000 })], tokens);

    expect(shown.map(({ id }) => id)).toEqual(['m1', 'm2']);
  });

  it('a token hidden by vision (not in the view) shows no balloon', () => {
    expect(shownAt(1100, [balloon({ tokenId: 'unseen' })])).toEqual([]);
  });

  it('a token seen only as a silhouette in the penumbra shows no balloon (its speech would name it)', () => {
    const tokens = tokensOf(goblinView({ silhouette: 'round' }));

    expect(shownAt(1100, [balloon()], tokens)).toEqual([]);
  });

  it('a balloon of another grid is not shown on this one', () => {
    expect(shownAt(1100, [balloon({ sceneId: 'scene-2' })])).toEqual([]);
  });
});

describe('speechAnchorOf', () => {
  it('at zoom 1 with no pan: the top center of the token, 8 px above it, in screen px', () => {
    const camera = { offsetX: 0, offsetY: 0, zoom: 1 };

    expect(speechAnchorOf({ col: 2, row: 3, width: 1, height: 1 }, camera)).toEqual({
      x: 160,
      y: 184,
    });
  });

  it('follows the camera: pan and zoom move the anchor, the 8 px gap stays in screen px', () => {
    const camera = { offsetX: 100, offsetY: -50, zoom: 2 };

    expect(speechAnchorOf({ col: 1, row: 2, width: 2, height: 2 }, camera)).toEqual({
      x: 100 + 128 * 2,
      y: -50 + 128 * 2 - 8,
    });
  });
});
