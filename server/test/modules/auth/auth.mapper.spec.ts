import { describe, expect, it } from 'vitest';
import { toAuthUserDto } from '../../../src/modules/auth/auth.mapper';
import { ANA_ID, userPo } from '../../support/auth-factories';

describe('toAuthUserDto', () => {
  it('a full user row becomes the client view without password hash or createdAt', () => {
    const row = userPo({ name: 'Ana', email: 'ana@mesa.com', role: 'admin' });
    expect(toAuthUserDto(row)).toEqual({
      id: ANA_ID,
      name: 'Ana',
      email: 'ana@mesa.com',
      role: 'admin',
    });
  });
});
