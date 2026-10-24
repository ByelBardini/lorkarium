import { describe, expect, it } from 'vitest';
import { composedTokenRow, stateHolderIdOf } from '../../../src/modules/tokens/linked-token';
import { toTokenDto } from '../../../src/modules/tokens/tokens.mapper';
import { BIA_ID } from '../../support/campaigns-factories';
import {
  ESTRADA_LYRA_ID,
  LYRA_ANCHOR_ID,
  lyraAnchorRow,
  linkedLyraRow,
} from '../../support/character-fakes';
import { lyraRow } from '../../support/tokens-factories';

function anchorWithLook() {
  const anchor = lyraAnchorRow();
  const look = {
    name: 'Lyra Vento',
    initials: 'LV',
    side: 'neutral' as const,
    imageAssetId: 'portrait',
    frame: 'round' as const,
    defeated: true,
  };
  return { ...anchor, token: { ...anchor.token, ...look } };
}

describe('a token linked to a character', () => {
  it('shows the name, initials, side, image, frame, defeat mark, bars and controllers of the anchor', () => {
    const composed = composedTokenRow(linkedLyraRow(), anchorWithLook());

    expect(composed.token).toMatchObject({
      name: 'Lyra Vento',
      initials: 'LV',
      side: 'neutral',
      imageAssetId: 'portrait',
      frame: 'round',
      defeated: true,
    });
    expect(composed.bars.map(({ id }) => id)).toEqual([
      `${LYRA_ANCHOR_ID}-pv`,
      `${LYRA_ANCHOR_ID}-insp`,
    ]);
    expect(composed.controllerIds).toEqual([BIA_ID]);
  });

  it('keeps its own place, size, layer, facing, flips, sight and light', () => {
    const own = linkedLyraRow({
      width: 2,
      height: 2,
      layer: 'objects',
      facing: 90,
      flipX: true,
      sightBright: '6.00',
      sightDim: '0.00',
      lightBright: '4.00',
      lightDim: '4.00',
      lightLit: false,
    });

    const { token } = composedTokenRow(own, anchorWithLook());

    expect(token).toMatchObject({
      id: ESTRADA_LYRA_ID,
      col: 8,
      row: 2,
      width: 2,
      height: 2,
      layer: 'objects',
      facing: 90,
      flipX: true,
      sightBright: '6.00',
      lightBright: '4.00',
      lightLit: false,
      anchorTokenId: LYRA_ANCHOR_ID,
    });
  });

  it('the DTO names its anchor, and an unlinked token passes as it is with a null anchor', () => {
    const dto = toTokenDto(composedTokenRow(linkedLyraRow(), lyraAnchorRow()), 'privileged');
    expect(dto.anchorTokenId).toBe(LYRA_ANCHOR_ID);
    expect(composedTokenRow(lyraRow(), undefined)).toEqual(lyraRow());
    expect(toTokenDto(lyraRow(), 'others').anchorTokenId).toBeNull();
  });

  it('holds its shared state in the anchor: conditions are read by the anchor id', () => {
    expect(stateHolderIdOf(linkedLyraRow())).toBe(LYRA_ANCHOR_ID);
    expect(stateHolderIdOf(lyraRow())).toBe(lyraRow().token.id);
  });
});
