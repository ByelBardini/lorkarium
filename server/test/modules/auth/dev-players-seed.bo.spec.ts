import { describe, expect, it } from 'vitest';
import { DevPlayersSeedBo } from '../../../src/modules/auth/dev-players-seed.bo';

const BIA = { username: 'bia', name: 'Bia', email: 'bia@lorkarium.dev', role: 'user' };
const CAIO = { username: 'caio', name: 'Caio', email: 'caio@lorkarium.dev', role: 'user' };

describe('DevPlayersSeedBo', () => {
  it('in development with neither account present both players are created as user, @bia and @caio', () => {
    expect(new DevPlayersSeedBo('development').decide(new Set())).toEqual({
      create: [BIA, CAIO],
      skipped: [],
    });
  });

  it('an existing bia@lorkarium.dev is skipped and only Caio is created', () => {
    expect(new DevPlayersSeedBo('development').decide(new Set(['bia@lorkarium.dev']))).toEqual({
      create: [CAIO],
      skipped: ['bia@lorkarium.dev'],
    });
  });

  it('with both accounts present there is nothing to create', () => {
    const existing = new Set(['bia@lorkarium.dev', 'caio@lorkarium.dev']);
    expect(new DevPlayersSeedBo('test').decide(existing)).toEqual({
      create: [],
      skipped: ['bia@lorkarium.dev', 'caio@lorkarium.dev'],
    });
  });

  it('in production the seed is refused with DEV_SEED_REFUSED citing the environment', () => {
    const refuse = () => new DevPlayersSeedBo('production').requireAllowed();
    expect(refuse).toThrow(
      expect.objectContaining({
        code: 'DEV_SEED_REFUSED',
        message: expect.stringContaining('production'),
      }),
    );
  });

  it('in production deciding is refused even with every account present', () => {
    const existing = new Set(['bia@lorkarium.dev', 'caio@lorkarium.dev']);
    const decide = () => new DevPlayersSeedBo('production').decide(existing);
    expect(decide).toThrow(expect.objectContaining({ code: 'DEV_SEED_REFUSED' }));
  });
});
