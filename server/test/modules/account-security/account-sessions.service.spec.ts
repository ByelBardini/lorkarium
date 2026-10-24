import { beforeEach, describe, expect, it } from 'vitest';
import { AccountSessionsService } from '../../../src/modules/account-security/account-sessions.service';
import { AuthSessionsDaoFake, ClockFake, SessionEndedFake } from '../../support/auth-fakes';
import { ANA_ID, authSessionPo } from '../../support/auth-factories';

const NOW = new Date('2026-10-14T12:00:00Z');
const BIA_ID = '2c9e4b1a-7d3f-4a8e-b6c5-0f1e2d3c4b5a';
const CURRENT = authSessionPo({
  id: 'sha:atual',
  publicId: '11111111-1111-4111-8111-111111111111',
  lastSeenAt: new Date('2026-10-14T11:59:00Z'),
});
const OTHER = authSessionPo({
  id: 'sha:outra',
  publicId: '22222222-2222-4222-8222-222222222222',
  lastSeenAt: new Date('2026-10-12T09:00:00Z'),
});
const EXPIRED = authSessionPo({
  id: 'sha:vencida',
  publicId: '33333333-3333-4333-8333-333333333333',
  expiresAt: new Date('2026-10-13T00:00:00Z'),
});
const OF_BIA = authSessionPo({
  id: 'sha:bia',
  userId: BIA_ID,
  publicId: '44444444-4444-4444-8444-444444444444',
});

describe('AccountSessionsService', () => {
  let sessions: AuthSessionsDaoFake;
  let sessionEnded: SessionEndedFake;
  let service: AccountSessionsService;

  beforeEach(() => {
    sessions = new AuthSessionsDaoFake([CURRENT, OTHER, EXPIRED, OF_BIA]);
    sessionEnded = new SessionEndedFake();
    service = new AccountSessionsService({ sessions, sessionEnded, clock: new ClockFake(NOW) });
  });

  it('lists only the live sessions of the person, the current one marked', async () => {
    const listed = await service.list(ANA_ID, 'sha:atual');
    expect(listed.map((session) => [session.id, session.current])).toEqual([
      ['11111111-1111-4111-8111-111111111111', true],
      ['22222222-2222-4222-8222-222222222222', false],
    ]);
  });

  it('revoking another session deletes it and drops its connections, after deleting', async () => {
    const rowWhenEnded: boolean[] = [];
    sessionEnded.whenEnded = () => rowWhenEnded.push(sessions.rows.has('sha:outra'));
    await service.revoke(ANA_ID, 'sha:atual', OTHER.publicId);
    expect(sessionEnded.ended).toEqual(['sha:outra']);
    expect(rowWhenEnded).toEqual([false]);
  });

  it('revoking the current session is refused with CURRENT_SESSION and keeps it', async () => {
    await expect(service.revoke(ANA_ID, 'sha:atual', CURRENT.publicId)).rejects.toMatchObject({
      code: 'CURRENT_SESSION',
    });
    expect(sessions.rows.has('sha:atual')).toBe(true);
  });

  it("revoking someone else's session is SESSION_NOT_FOUND and keeps it", async () => {
    await expect(service.revoke(ANA_ID, 'sha:atual', OF_BIA.publicId)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
    expect(sessions.rows.has('sha:bia')).toBe(true);
    expect(sessionEnded.ended).toEqual([]);
  });

  it('revoke-others ends every other session of the person and counts them', async () => {
    expect(await service.revokeOthers(ANA_ID, 'sha:atual')).toBe(2);
    expect(sessionEnded.ended.sort()).toEqual(['sha:outra', 'sha:vencida']);
    expect([...sessions.rows.keys()].sort()).toEqual(['sha:atual', 'sha:bia']);
  });

  it('revoke-others with only the current session ends nothing', async () => {
    sessions = new AuthSessionsDaoFake([CURRENT]);
    service = new AccountSessionsService({ sessions, sessionEnded, clock: new ClockFake(NOW) });
    expect(await service.revokeOthers(ANA_ID, 'sha:atual')).toBe(0);
    expect(sessionEnded.ended).toEqual([]);
  });
});
