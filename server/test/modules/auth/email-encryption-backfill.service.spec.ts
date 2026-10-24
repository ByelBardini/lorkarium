import { describe, expect, it } from 'vitest';
import { EmailEncryptionBackfillService } from '../../../src/modules/auth/email-encryption-backfill.service';
import { DataCipherFake, UsersDaoFake } from '../../support/auth-fakes';

describe('EmailEncryptionBackfillService', () => {
  it('two accounts in clear both get the cipher bound to their id and the blind index', async () => {
    const users = new UsersDaoFake(
      [],
      [
        { id: 'u1', email: 'ana@x.com' },
        { id: 'u2', email: 'Bia@X.com' },
      ],
    );
    const result = await new EmailEncryptionBackfillService(users, new DataCipherFake()).run();
    expect(result).toEqual({ updated: 2 });
    expect(users.sealed).toEqual([
      {
        userId: 'u1',
        emailCipher: 'sealed:user-email:u1:ana@x.com',
        emailIndex: 'idx:email-index:ana@x.com',
      },
      {
        userId: 'u2',
        emailCipher: 'sealed:user-email:u2:bia@x.com',
        emailIndex: 'idx:email-index:bia@x.com',
      },
    ]);
  });

  it('a second run finds nothing in clear and touches nothing', async () => {
    const users = new UsersDaoFake([], [{ id: 'u1', email: 'ana@x.com' }]);
    const backfill = new EmailEncryptionBackfillService(users, new DataCipherFake());
    await backfill.run();
    expect(await backfill.run()).toEqual({ updated: 0 });
    expect(users.sealed).toHaveLength(1);
  });
});
