import { describe, expect, it } from 'vitest';
import { JuggernautBo, type JuggernautSeat } from '../../../src/modules/campaigns/juggernaut.bo';
import { VHARN_ID } from '../../support/campaigns-factories';

const ROOT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function seat(overrides: Partial<JuggernautSeat> = {}): JuggernautSeat {
  return { role: 'player', owner: false, juggernaut: false, roleBefore: null, ...overrides };
}

function rootAt(found: JuggernautSeat | null): JuggernautBo {
  return new JuggernautBo(VHARN_ID, ROOT_ID, found);
}

describe('JuggernautBo.start', () => {
  it('Root, not a member of Vharn, starts with no role to go back to', () => {
    expect(rootAt(null).start()).toEqual({ change: 'started', roleBefore: null });
  });

  it.each(['player', 'spectator', 'master'] as const)(
    'Root as a %s starts keeping that role',
    (role) => {
      expect(rootAt(seat({ role })).start()).toEqual({ change: 'started', roleBefore: role });
    },
  );

  it('Root already in the mode is unchanged', () => {
    const on = seat({ role: 'master', juggernaut: true, roleBefore: 'player' });
    expect(rootAt(on).start()).toEqual({ change: 'unchanged' });
  });

  it('Root, the owner of Vharn, is refused with ALREADY_OWNER citing the table and him', () => {
    const owner = seat({ role: 'master', owner: true });
    expect(() => rootAt(owner).start()).toThrow(
      expect.objectContaining({
        code: 'ALREADY_OWNER',
        message: expect.stringMatching(new RegExp(`${ROOT_ID}.*${VHARN_ID}`)),
      }),
    );
  });
});

describe('JuggernautBo.end', () => {
  it.each([
    ['player', 'player'],
    ['no role before', null],
  ] as const)('Root in the mode with %s ends restoring it', (_case, roleBefore) => {
    const on = seat({ role: 'master', juggernaut: true, roleBefore });
    expect(rootAt(on).end()).toEqual({ change: 'ended', restore: roleBefore });
  });

  it('Root, a player not in the mode, is unchanged and keeps his role', () => {
    expect(rootAt(seat()).end()).toEqual({ change: 'unchanged', role: 'player' });
  });

  it('Root, not a member of Vharn, gets CAMPAIGN_NOT_FOUND citing the table and him', () => {
    expect(() => rootAt(null).end()).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_NOT_FOUND',
        message: expect.stringMatching(new RegExp(`${VHARN_ID}.*${ROOT_ID}`)),
      }),
    );
  });
});
