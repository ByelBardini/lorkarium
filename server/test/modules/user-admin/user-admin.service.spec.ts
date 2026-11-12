import { beforeEach, describe, expect, it } from 'vitest';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import {
  UserAdminService,
  type UserAdminWriteDaos,
} from '../../../src/modules/user-admin/user-admin.service';
import { InvitationsDaoFake, PasswordResetsDaoFake } from '../../support/account-links-fakes';
import { MailerFake } from '../../support/account-security-fakes';
import {
  AuthSessionsDaoFake,
  ClockFake,
  DataCipherFake,
  SessionEndedFake,
} from '../../support/auth-fakes';
import { authSessionPo, userPo } from '../../support/auth-factories';
import { ProfileChangedFake } from '../../support/profiles-fakes';
import {
  AdminSeatsFake,
  MembershipsForgetFake,
  OwnerLimitsFake,
  RevokedSeatsFake,
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
  let adminSeats: AdminSeatsFake;
  let juggernauts: RevokedSeatsFake;
  let invitations: InvitationsDaoFake;
  let profiles: ProfileChangedFake;
  let ownedTables: OwnerLimitsFake;
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
    adminSeats = new AdminSeatsFake(journal);
    juggernauts = new RevokedSeatsFake(journal);
    invitations = new InvitationsDaoFake();
    profiles = new ProfileChangedFake(journal);
    ownedTables = new OwnerLimitsFake(journal);
    sessionEnded.whenEnded = (sessionId) => journal.push(`ended ${sessionId}`);
    const daos: UserAdminWriteDaos = {
      accounts,
      sessions,
      passwordResets: resets,
      invitations,
      adminSeats,
    };
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
      juggernauts,
      profiles,
      ownedTables,
      storage,
      notices: new SecurityNoticesService(mailer, () => undefined),
      cipher: new DataCipherFake(),
      clock: new ClockFake(NOW),
      appPublicUrl: 'https://mesa.example.com',
    });
  });

  describe('changePlan', () => {
    it('saves the plan, then tells the live tables of Bia her seal and those she owns their limits', async () => {
      const user = await service.changePlan(BIA_ID, 'lenda');

      expect(user).toMatchObject({ id: BIA_ID, plan: 'lenda' });
      expect((await accounts.findAccount(BIA_ID))?.plan).toBe('lenda');
      expect(journal).toEqual(['commit', `profileChanged:${BIA_ID}`, `limits ${BIA_ID}`]);
    });

    it('the admin changes their own plan: no SELF_ACTION', async () => {
      const user = await service.changePlan(ADMIN.id, 'narrador');

      expect(user).toMatchObject({ id: ADMIN.id, role: 'admin', plan: 'narrador' });
    });

    it('the same plan again saves and tells no table', async () => {
      await service.changePlan(BIA_ID, 'free');

      expect(journal).toEqual(['commit']);
    });

    it('an unknown account is USER_NOT_FOUND and nobody is told', async () => {
      const missing = '99999999-9999-4999-8999-999999999999';

      await expect(service.changePlan(missing, 'lenda')).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });
      expect(profiles.told).toEqual([]);
      expect(ownedTables.told).toEqual([]);
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

  describe('changeRole ends what only the admin role gave', () => {
    const SEATS = [{ campaignId: 'vharn', restored: 'player' as const }];

    it('admin → user revokes the seats inside the transaction and announces after the commit', async () => {
      await service.changeRole(ADMIN, BIA_ID, 'admin');
      journal.splice(0);
      adminSeats.seats = SEATS;

      await service.changeRole(ADMIN, BIA_ID, 'user');

      expect(journal).toEqual([
        `revoke ${BIA_ID}`,
        'commit',
        `announce ${BIA_ID}`,
        `profileChanged:${BIA_ID}`,
        `limits ${BIA_ID}`,
      ]);
      expect(juggernauts.announced).toEqual([{ userId: BIA_ID, seats: SEATS }]);
    });

    it('a failure revoking stops before the commit: nothing is announced', async () => {
      adminSeats.revokeAdminSeatsOf = () => Promise.reject(new Error('lock timeout'));
      await expect(service.changeRole(ADMIN, BIA_ID, 'user')).rejects.toThrow('lock timeout');
      expect(journal).toEqual([]);
    });

    it('with no seat to revoke nobody is told', async () => {
      await service.changeRole(ADMIN, BIA_ID, 'user');
      expect(juggernauts.announced).toEqual([]);
    });

    it.each([
      ['user → admin', 'user'],
      ['admin → admin', 'admin'],
    ] as const)('%s revokes nothing', async (_case, from) => {
      if (from === 'admin') await service.changeRole(ADMIN, BIA_ID, 'admin');

      await service.changeRole(ADMIN, BIA_ID, 'admin');

      expect(adminSeats.revokedFor).toEqual([]);
    });

    it.each([
      ['SELF_ACTION', ADMIN.id],
      ['USER_NOT_FOUND', '99999999-9999-4999-8999-999999999999'],
    ])('a refusal (%s) revokes nothing', async (code, userId) => {
      await expect(service.changeRole(ADMIN, userId, 'user')).rejects.toMatchObject({ code });
      expect(adminSeats.revokedFor).toEqual([]);
    });
  });

  describe('the admin invitations of an account losing its authority', () => {
    beforeEach(async () => {
      const sent = { emailCipher: 'c', sentAt: NOW, expiresAt: NOW };
      const issued = (id: string, invitedBy: string, role: 'admin' | 'user') =>
        invitations.insert({ id, tokenHash: id, emailIndex: id, invitedBy, role, ...sent });
      await issued('by-bia-admin', BIA_ID, 'admin');
      await issued('by-bia-user', BIA_ID, 'user');
      await issued('by-lucas-admin', ADMIN.id, 'admin');
    });

    const left = (): string[] => invitations.rows.map((row) => row.id);

    it('a demotion deletes the role=admin invitations it issued, nothing else', async () => {
      await service.changeRole(ADMIN, BIA_ID, 'user');
      expect(left()).toEqual(['by-bia-user', 'by-lucas-admin']);
    });

    it('a suspension deletes them', async () => {
      await service.suspend(ADMIN, BIA_ID);
      expect(left()).toEqual(['by-bia-user', 'by-lucas-admin']);
    });

    it('an account deletion deletes them', async () => {
      await service.delete(ADMIN, BIA_ID);
      expect(left()).toEqual(['by-bia-user', 'by-lucas-admin']);
    });

    it('being made admin deletes nothing', async () => {
      await service.changeRole(ADMIN, BIA_ID, 'admin');
      expect(left()).toHaveLength(3);
    });
  });

  describe('changeRole', () => {
    it('a new role tells the live tables of Bia her seal and those she owns their limits', async () => {
      await service.changeRole(ADMIN, BIA_ID, 'admin');

      expect(journal).toEqual(['commit', `profileChanged:${BIA_ID}`, `limits ${BIA_ID}`]);
    });

    it('the same role again tells no table', async () => {
      await service.changeRole(ADMIN, BIA_ID, 'user');

      expect(profiles.told).toEqual([]);
      expect(ownedTables.told).toEqual([]);
    });

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
