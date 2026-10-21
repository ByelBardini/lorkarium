import type { LightDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { buildBoardView, type BoardView } from '@/renderer/board-view';
import { boardFacingTargetOf } from '@/renderer/handle-targets';
import { ANA_AT_TABLE, LYRA_ID, VHARN_SCENE, lyra } from '../support/table-session-fixtures';
import { BRAZIER_ID, CORRIDOR_TORCH_ID, brazier, corridorTorch } from '../support/light-fixtures';

const SPOTLIGHT = corridorTorch({ facing: 90, angle: 60 });

function anaView(more: Partial<Parameters<typeof buildBoardView>[0]> = {}): BoardView {
  return buildBoardView({
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tokens: [lyra()],
    selectedTokenIds: [],
    activeLayer: 'tokens',
    canChooseLayer: true,
    preview: [],
    facingPreview: {},
    resizePreview: {},
    drag: null,
    dragged: {},
    readOnly: false,
    tool: 'lights',
    currentTokenIds: [],
    viewer: { userId: ANA_AT_TABLE.userId, isMaster: true },
    drawings: [],
    selectedDrawingIds: [],
    drawingPreview: [],
    drawingStyle: DEFAULT_DRAWING_STYLE,
    ...more,
  });
}

function lightsPicked(lights: LightDto[], selectedLightIds: string[]): BoardView {
  return anaView({ lights, selectedLightIds });
}

describe('boardFacingTargetOf', () => {
  it('with the lights tool and a spotlight picked alone, the handle aims the light', () => {
    expect(boardFacingTargetOf(lightsPicked([SPOTLIGHT], [CORRIDOR_TORCH_ID]))?.id).toBe(
      CORRIDOR_TORCH_ID,
    );
  });

  it('a light of 360° picked shows no handle: it has nowhere to point', () => {
    expect(boardFacingTargetOf(lightsPicked([corridorTorch()], [CORRIDOR_TORCH_ID]))).toBeNull();
  });

  it('two spotlights picked show no handle', () => {
    const lights = [SPOTLIGHT, brazier({ angle: 60 })];

    expect(boardFacingTargetOf(lightsPicked(lights, [CORRIDOR_TORCH_ID, BRAZIER_ID]))).toBeNull();
  });

  it('with Selecionar and Lyra selected, the handle turns Lyra as before', () => {
    const view = anaView({ tool: 'select', selectedTokenIds: [LYRA_ID], lights: [SPOTLIGHT] });

    expect(boardFacingTargetOf(view)?.id).toBe(LYRA_ID);
  });
});
