import { describe, expect, it } from 'vitest';
import { flowSpeechItems, speechRunsOf, type SpeechRun } from '@/renderer/speech-flow';

function shapeOf(runs: readonly SpeechRun[]): string[] {
  return runs.map((run) => {
    const shown = run.kind === 'word' ? run.text : `[${run.emote.id}]`;
    return run.spaced ? `${shown}_` : shown;
  });
}

function size(width: number, height = 20, gapAfter = 0) {
  return { width, height, gapAfter };
}

describe('speechRunsOf', () => {
  // Regression: PixiJS measured "Ninguém " without its space and the balloon read "Ninguémmepega".
  it('cuts the line into words and pictures, marking the ones a space follows', () => {
    expect(shapeOf(speechRunsOf('Ninguém me pega :trollface: :D'))).toEqual([
      'Ninguém_',
      'me_',
      'pega_',
      '[trollface]_',
      '[grin]',
    ]);
  });

  it('a line without codes is only words; a leading space marks nothing', () => {
    expect(shapeOf(speechRunsOf(' às 10:30'))).toEqual(['às_', '10:30']);
  });
});

describe('flowSpeechItems', () => {
  it('lays a row left to right with the gaps, each run centered on the tallest', () => {
    const layout = flowSpeechItems([size(30, 20, 4), size(26, 26)], 216);
    expect(layout).toEqual({
      positions: [
        { x: 0, y: 3 },
        { x: 34, y: 0 },
      ],
      width: 60,
      height: 26,
    });
  });

  it('starts a new row when the next run passes the width; a gap at a row end takes no width', () => {
    const layout = flowSpeechItems([size(100, 20, 4), size(100, 20, 4), size(20)], 210);
    expect(layout.positions).toEqual([
      { x: 0, y: 0 },
      { x: 104, y: 0 },
      { x: 0, y: 20 },
    ]);
    expect([layout.width, layout.height]).toEqual([204, 40]);
  });

  it('a run wider than the line gets its own row, never an empty one before it', () => {
    const layout = flowSpeechItems([size(300, 40)], 216);
    expect(layout).toEqual({ positions: [{ x: 0, y: 0 }], width: 300, height: 40 });
  });

  it('nothing to lay is an empty line', () => {
    expect(flowSpeechItems([], 216)).toEqual({ positions: [], width: 0, height: 0 });
  });
});
