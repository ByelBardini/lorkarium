import { describe, expect, it } from 'vitest';
import { PasswordLinksService } from '../../../src/modules/account-links/password-links.service';
import { PasswordResetsDaoFake } from '../../support/account-links-fakes';
import { ClockFake, SessionTokenFake } from '../../support/auth-fakes';

const NOW = new Date('2026-11-20T12:00:00Z');
const USER_ID = '22222222-2222-4222-8222-222222222222';

describe('PasswordLinksService.issue', () => {
  function serviceWith(resets: PasswordResetsDaoFake): PasswordLinksService {
    return new PasswordLinksService({
      resets,
      linkTokens: new SessionTokenFake(),
      clock: new ClockFake(NOW),
      appPublicUrl: 'https://mesa.example.com',
    });
  }

  it('stores the hash for one hour and answers the link with the token in the fragment', async () => {
    const resets = new PasswordResetsDaoFake();
    const issued = await serviceWith(resets).issue(USER_ID);
    expect(issued).toEqual({
      link: 'https://mesa.example.com/reset-password#token=token-1',
      expiresAt: new Date('2026-11-20T13:00:00Z'),
    });
    expect(resets.rows).toMatchObject([
      { userId: USER_ID, tokenHash: 'sha:token-1', createdAt: NOW, expiresAt: issued.expiresAt },
    ]);
  });

  it('a second link replaces the first: one per account', async () => {
    const resets = new PasswordResetsDaoFake();
    const service = serviceWith(resets);
    await service.issue(USER_ID);
    await service.issue(USER_ID);
    expect(resets.rows.map((row) => row.tokenHash)).toEqual(['sha:token-2']);
  });
});
