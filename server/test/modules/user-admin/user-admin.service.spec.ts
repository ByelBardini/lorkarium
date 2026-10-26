import { beforeEach, describe, expect, it } from 'vitest';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import {
  UserAdminService,
  type UserAdminWriteDaos,
} from '../../../src/modules/user-admin/user-admin.service';
import { PasswordResetsDaoFake } from '../../support/account-links-fakes';
import { MailerFake } from '../../support/account-security-fakes';
import {
  AuthSessionsDaoFake,
  ClockFake,
  DataCipherFake,
  SessionEndedFake,
} from '../../support/auth-fakes';
import { authSessionPo, userPo } from '../../support/auth-factories';
import {
  MembershipsForgetFake,
  StorageRemoveFake,
  UserAdminDaoFake,
} from '../../support/user-admin-fakes';

const NOW = new Date('2026-10-24T12:00:00Z');
const ADMIN = { id: '11111111-1111-4111-8111-111111111111', name: 'Lucas' };
const BIA_ID = '22222222-2222-4222-8222-222222222222';
const CAIO_ID = '55555555-5555-4555-8555-555555555555';

describe('UserAdminService', () => {
  let accounts: UserAdminDaoFake;
  let sessions: AuthSessionsDaoFake;
  let resets: PasswordResetsDaoFake;
  let sessionEnded: SessionEndedFake;
  let memberships: MembershipsForgetFake;
  let storage: StorageRemoveFake;
  let mailer: MailerFake;
  let journal: string[];
  let service: UserAdminService;

  beforeEach(() => {
    accounts = new UserAdminDaoFake([
      userPo({ id: ADMIN.id, email: 'lucas@x.com', name: 'Lucas', role: 'admin' }),
      userPo({
        id: BIA_ID,
        email: 'bia@x.com',
        name: 'Bia',
        avatarId: '33333333-3333-4333-8333-333333333333',
        diceTextureId: '44444444-4444-4444-8444-444444444444',
      }),
      userPo({ id: CAIO_ID, email: 'caio@x.com', name: 'Caio' }),
    ]);
    sessions = new AuthSessionsDaoFake([
      authSessionPo({ id: 'sha:bia-1', userId: BIA_ID }),
      authSessionPo({ id: 'sha:bia-2', userId: BIA_ID }),
      authSessionPo({ id: 'sha:lucas', userId: ADMIN.id }),
    ]);
    resets = new PasswordResetsDaoFake();
    sessionEnded = new SessionEndedFake();
    memberships = new MembershipsForgetFake();
    storage = new StorageRemoveFake();
    mailer = new MailerFake();
    journal = [];
    sessionEnded.whenEnded = (sessionId) => journal.push(`ended ${sessionId}`);
    const daos: UserAdminWriteDaos = { accounts, sessions, passwordResets: resets };
    service = new UserAdminService({
      accounts,
      invitations: { listPending: async () => [] },
      transaction: async (work) => {
        const result = await work(daos);
        journal.push('commit');
        return result;
      },
      sessionEnded,
      memberships,
      storage,
      notices: new SecurityNoticesService(mailer, () => undefined),
      cipher: new DataCipherFake(),
      clock: new ClockFake(NOW),
      appPublicUrl: 'https://mesa.example.com',
    });
  });

  describe('suspend', () => {
    it('marks the account, drops its sessions and links, and signs it out after the commit', async () => {
      await resets.replace({ userId: BIA_ID, tokenHash: 'h', createdAt: NOW, expiresAt: NOW });
      const user = await service.suspend(ADMIN, BIA_ID);
      expect(user.status).toBe('suspended');
      expect(journal).toEqual(['commit', 'ended sha:bia-1', 'ended sha:bia-2']);
      expect(resets.rows).toEqual([]);
      expect([...sessions.rows.keys()]).toEqual(['sha:lucas']);
    });

    it('tells the account it was suspended', async () => {
      await service.suspend(ADMIN, BIA_ID);
      expect(mailer.sent.map((mail) => [mail.to, mail.subject])).toEqual([
        ['bia@x.com', 'Seu acesso ao Lorkarium foi suspenso'],
      ]);
    });

    it('suspending again changes nothing and tells nobody (idempotent)', async () => {
      await service.suspend(ADMIN, BIA_ID);
      journal.length = 0;
      await service.suspend(ADMIN, BIA_ID);
      expect(journal).toEqual(['commit']);
      expect(mailer.sent).toHaveLength(1);
    });

    it('the admin on their own account is SELF_ACTION and nothing is written', async () => {
      await expect(service.suspend(ADMIN, ADMIN.id)).rejects.toMatchObject({ code: 'SELF_ACTION' });
      expect(journal).toEqual([]);
    });

    it('an unknown account is USER_NOT_FOUND', async () => {
      const unknown = '44444444-4444-4444-8444-444444444444';
      await expect(service.suspend(ADMIN, unknown)).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });
    });
  });

  describe('reactivate', () => {
    it('clears the suspension and welcomes back', async () => {
      await service.suspend(ADMIN, BIA_ID);
      const user = await service.reactivate(ADMIN, BIA_ID);
      expect(user.status).toBe('active');
      expect(mailer.sent.at(-1)?.subject).toBe('Seu acesso ao Lorkarium voltou');
    });

    it('an active account stays and nobody is told', async () => {
      await service.reactivate(ADMIN, BIA_ID);
      expect(mailer.sent).toEqual([]);
    });
  });

  describe('changeRole', () => {
    it('making admin stores the role and tells the account, naming nobody', async () => {
      const user = await service.changeRole(ADMIN, BIA_ID, 'admin');
      expect(user.role).toBe('admin');
      expect(mailer.sent[0]?.text).toContain(
        'A conta @bia passou a ter acesso ao backoffice do Lorkarium.',
      );
      expect(mailer.sent[0]?.text).not.toContain('Lucas');
    });

    it('taking admin away sends no mail', async () => {
      await service.changeRole(ADMIN, BIA_ID, 'admin');
      await service.changeRole(ADMIN, BIA_ID, 'user');
      expect(mailer.sent).toHaveLength(1);
    });

    it('the own role is SELF_ACTION without writing', async () => {
      await expect(service.changeRole(ADMIN, ADMIN.id, 'user')).rejects.toMatchObject({
        code: 'SELF_ACTION',
      });
      expect((await accounts.findAccount(ADMIN.id))?.role).toBe('admin');
    });
  });

  describe('delete', () => {
    it('locks, deletes, then signs out, forgets the memberships and removes the photo and texture', async () => {
      await service.delete(ADMIN, BIA_ID);
      expect(accounts.deleted).toEqual([BIA_ID]);
      expect(journal).toEqual(['commit', 'ended sha:bia-1', 'ended sha:bia-2']);
      expect(memberships.forgotten).toEqual([BIA_ID]);
      expect(storage.removed).toEqual([
        'avatars/33333333-3333-4333-8333-333333333333',
        'dice-textures/44444444-4444-4444-8444-444444444444',
      ]);
    });

    it('owning a table with others is OWNS_SHARED_CAMPAIGNS and nothing is deleted nor told', async () => {
      accounts.owned.set(BIA_ID, [{ id: 'vharn', name: 'Vharn', otherMembers: 3 }]);
      await expect(service.delete(ADMIN, BIA_ID)).rejects.toMatchObject({
        code: 'OWNS_SHARED_CAMPAIGNS',
        blockingCampaigns: [{ id: 'vharn', name: 'Vharn', otherMembers: 3 }],
      });
      expect(accounts.deleted).toEqual([]);
      expect(sessionEnded.ended).toEqual([]);
      expect(memberships.forgotten).toEqual([]);
    });

    it('an account without a photo removes nothing from the bucket', async () => {
      await service.delete(ADMIN, CAIO_ID);
      expect(accounts.deleted).toEqual([CAIO_ID]);
      expect(storage.removed).toEqual([]);
    });
  });

  describe('deletionCheck', () => {
    it('says how many solo tables go with the account', async () => {
      accounts.owned.set(BIA_ID, [{ id: 'a', name: 'A', otherMembers: 0 }]);
      expect(await service.deletionCheck(ADMIN, BIA_ID)).toEqual({
        blockingCampaigns: [],
        soloCampaigns: 1,
      });
    });
  });
});
