import { describe, expect, it } from 'vitest';
import { CurrentPasswordService } from '../../../src/modules/account-security/current-password.service';
import { PasswordHasherFake, UsersDaoFake } from '../../support/auth-fakes';
import { ANA_ID, userPo } from '../../support/auth-factories';

describe('CurrentPasswordService', () => {
  const users = new UsersDaoFake([userPo({ passwordHash: 'hashed:senha-da-ana' })]);
  const service = new CurrentPasswordService(users, new PasswordHasherFake());

  it('the current password returns the account row', async () => {
    expect((await service.require(ANA_ID, 'senha-da-ana')).id).toBe(ANA_ID);
  });

  it('a wrong one is CURRENT_PASSWORD_INVALID naming the user, never the password', async () => {
    const refusal: unknown = await service.require(ANA_ID, 'errada').catch((error) => error);
    expect(refusal).toMatchObject({ code: 'CURRENT_PASSWORD_INVALID', userId: ANA_ID });
    expect(String((refusal as Error).message)).not.toContain('errada');
  });

  it('an account that no longer exists is refused the same way', async () => {
    await expect(service.require('user-sumido', 'x')).rejects.toMatchObject({
      code: 'CURRENT_PASSWORD_INVALID',
    });
  });
});
