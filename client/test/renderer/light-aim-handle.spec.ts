import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { HANDLE_GAP } from '@/renderer/facing-handle';
import { lightAimTarget } from '@/renderer/light-aim-handle';
import { LIGHT_ICON_REACH, lightViewsOf, type LightView } from '@/renderer/light-view';
import { CORRIDOR_TORCH_ID, corridorTorch } from '../support/light-fixtures';

const CELL = CELL_WORLD_SIZE;

function spotlightView(facing: number): LightView {
  const [view] = lightViewsOf({
    lights: [corridorTorch({ facing, angle: 60 })],
    walls: [],
    scene: { widthCells: 20, heightCells: 12 },
    viewer: { isMaster: true },
    tool: 'lights',
    selectedLightIds: [CORRIDOR_TORCH_ID],
  });
  if (!view) throw new Error('the spotlight has no view');
  return view;
}

describe('lightAimTarget', () => {
  it('a spotlight at (5, 5) looking down (90) has its stem from the icon to the handle below', () => {
    const { stem } = lightAimTarget(spotlightView(90));

    expect(stem.from.x).toBeCloseTo(5 * CELL, 9);
    expect(stem.from.y).toBeCloseTo(5 * CELL + LIGHT_ICON_REACH, 9);
    expect(stem.to.x).toBeCloseTo(5 * CELL, 9);
    expect(stem.to.y).toBeCloseTo(5 * CELL + LIGHT_ICON_REACH + HANDLE_GAP, 9);
  });

  it('the pointer to the left asks for 180, and at 200° with Shift snaps to 180', () => {
    const target = lightAimTarget(spotlightView(90));
    const at200 = {
      x: 5 * CELL + Math.cos((200 * Math.PI) / 180) * 100,
      y: 5 * CELL + Math.sin((200 * Math.PI) / 180) * 100,
    };

    expect(target.facingAt({ x: 2 * CELL, y: 5 * CELL }, 90, false)).toBe(180);
    expect(target.facingAt(at200, 90, false)).toBe(200);
    expect(target.facingAt(at200, 90, true)).toBe(180);
  });

  it('the pointer right over the icon keeps where it points', () => {
    expect(
      lightAimTarget(spotlightView(90)).facingAt({ x: 5 * CELL, y: 5 * CELL }, 90, false),
    ).toBe(90);
  });

  it('the preview and the release become the intents of the light', () => {
    const target = lightAimTarget(spotlightView(90));

    expect(target.previewed(270)).toEqual({
      kind: 'lightAimPreviewed',
      lightId: CORRIDOR_TORCH_ID,
      facing: 270,
    });
    expect(target.previewed(null)).toEqual({
      kind: 'lightAimPreviewed',
      lightId: CORRIDOR_TORCH_ID,
      facing: null,
    });
    expect(target.turned(270)).toEqual({
      kind: 'lightAimed',
      lightId: CORRIDOR_TORCH_ID,
      facing: 270,
    });
  });
});
