import { describe, expect, it } from 'vitest';
import { toTokenDto, toTokenUpdatePo } from '../../../src/modules/tokens/tokens.mapper';
import { BIA_ID } from '../../support/campaigns-factories';
import { LYRA_ID, lyraPo, lyraRow } from '../../support/tokens-factories';

describe('tokens mapper', () => {
  it('the privileged audience gets every bar and canControl', () => {
    const dto = toTokenDto(lyraRow(), 'privileged');
    expect(dto).toMatchObject({ id: LYRA_ID, canControl: true, controllerIds: [BIA_ID] });
    expect(dto.bars.map(({ label, position }) => [label, position])).toEqual([
      ['PV', 0],
      ['Inspiração', 1],
    ]);
  });

  it('others never receive a controllers bar, and the rest keep their position', () => {
    const dto = toTokenDto(lyraRow(), 'others');
    expect(dto.canControl).toBe(false);
    expect(dto.bars.map(({ label, position }) => [label, position])).toEqual([['Inspiração', 1]]);
    expect(JSON.stringify(dto)).not.toContain('"PV"');
  });

  it.each(['privileged', 'others'] as const)(
    'a token on the objects layer reaches the %s audience on the objects layer',
    (audience) => {
      const row = lyraRow({ token: lyraPo({ layer: 'objects' }) });
      expect(toTokenDto(row, audience).layer).toBe('objects');
    },
  );

  it('the token DTO carries no persistence fields', () => {
    expect(toTokenDto(lyraRow(), 'others')).not.toHaveProperty('sceneId');
  });

  it('an update command becomes the fields, the bars and the controllers to save', () => {
    const update = toTokenUpdatePo(
      {
        name: 'Lyra',
        initials: 'LY',
        side: 'ally',
        size: 1,
        controllerIds: [BIA_ID],
        bars: [{ label: 'PV', current: 1, max: 9, color: 'ember', visibility: 'everyone' }],
      },
      [BIA_ID],
    );
    expect(update).toEqual({
      fields: { name: 'Lyra', initials: 'LY', side: 'ally', size: 1 },
      bars: [{ label: 'PV', current: 1, max: 9, color: 'ember', visibility: 'everyone' }],
      controllerIds: [BIA_ID],
    });
  });
});
