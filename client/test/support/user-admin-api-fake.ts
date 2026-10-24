import type {
  AdminDirectoryResponseDto,
  AdminInvitationDto,
  AdminUserDto,
  CreateInvitationRequestDto,
  InvitationLinkResponseDto,
  MailSampleDto,
  SendMailSampleResponseDto,
  PasswordResetLinkResponseDto,
  UserDeletionCheckDto,
  UserRoleDto,
} from '@lorkarium/contracts';
import type { UserAdminApi, UserAdminResult } from '@/services/user-admin-api';
import { ROOT_ADMIN } from './auth-api-fake';
import { ScriptedAnswers } from './scripted-answers';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function ago(now: Date, ms: number): string {
  return new Date(now.getTime() - ms).toISOString();
}

/** The signed-in admin of the tests (`ROOT_ADMIN`'s id), as the backoffice lists it. */
export function lucasAdmin(now: Date): AdminUserDto {
  return {
    id: ROOT_ADMIN.id,
    username: 'lucas',
    name: 'Lucas',
    email: 'lucas@exemplo.com',
    role: 'admin',
    status: 'active',
    color: 'bone',
    avatarId: null,
    campaignCount: 3,
    lastSeenAt: now.toISOString(),
    createdAt: ago(now, 400 * DAY_MS),
  };
}

export function bia(now: Date): AdminUserDto {
  return {
    id: '2c9e4b1a-7d3f-4a8e-b6c5-0f1e2d3c4b5a',
    username: 'biaflor',
    name: 'Bia',
    email: 'bia@exemplo.com',
    role: 'user',
    status: 'active',
    color: 'rose',
    avatarId: null,
    campaignCount: 2,
    lastSeenAt: ago(now, 3 * HOUR_MS),
    createdAt: ago(now, 30 * DAY_MS),
  };
}

export function pedroSuspended(now: Date): AdminUserDto {
  return {
    id: '5d6e7f80-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
    username: 'pedrinho',
    name: 'Pedro',
    email: 'pedro@exemplo.com',
    role: 'user',
    status: 'suspended',
    color: 'steel',
    avatarId: null,
    campaignCount: 1,
    lastSeenAt: null,
    createdAt: ago(now, 60 * DAY_MS),
  };
}

export function marinaInvited(now: Date): AdminInvitationDto {
  return {
    id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    email: 'marina@exemplo.com',
    role: 'user',
    invitedBy: 'lucas',
    sentAt: ago(now, 2 * DAY_MS),
    expiresAt: new Date(now.getTime() + 5 * DAY_MS).toISOString(),
  };
}

export function joaoExpired(now: Date): AdminInvitationDto {
  return {
    id: '1f2e3d4c-5b6a-4978-8a6b-5c4d3e2f1a0b',
    email: 'joao@exemplo.com',
    role: 'admin',
    invitedBy: 'lucas',
    sentAt: ago(now, 8 * DAY_MS),
    expiresAt: ago(now, DAY_MS),
  };
}

type Answers = {
  directory: UserAdminResult<AdminDirectoryResponseDto>;
  invite: UserAdminResult<InvitationLinkResponseDto>;
  resendInvitation: UserAdminResult<InvitationLinkResponseDto>;
  cancelInvitation: UserAdminResult<null>;
  changeRole: UserAdminResult<AdminUserDto>;
  suspend: UserAdminResult<AdminUserDto>;
  reactivate: UserAdminResult<AdminUserDto>;
  sendPasswordLink: UserAdminResult<PasswordResetLinkResponseDto>;
  deletionCheck: UserAdminResult<UserDeletionCheckDto>;
  deleteUser: UserAdminResult<null>;
  mailSamples: UserAdminResult<MailSampleDto[]>;
  sendMailSample: UserAdminResult<SendMailSampleResponseDto>;
};

/** Three of the system e-mails, enough for the "E-mails" page. */
export const MAIL_SAMPLES: readonly MailSampleDto[] = [
  {
    id: 'email-confirmation',
    name: 'Confirmação do novo e-mail',
    subject: 'Confirme seu novo e-mail no Lorkarium',
  },
  { id: 'invitation', name: 'Convite', subject: 'Seu convite para o Lorkarium' },
  {
    id: 'access-suspended',
    name: 'Acesso suspenso',
    subject: 'Seu acesso ao Lorkarium foi suspenso',
  },
];

/** A `UserAdminApi` that keeps the directory like the server would (an invitation shows in the
 *  next `directory`, a suspension too); any method can be scripted by `answers`. */
export class UserAdminApiFake implements UserAdminApi {
  readonly answers = new ScriptedAnswers<Answers>();
  users: AdminUserDto[];
  invitations: AdminInvitationDto[];
  private linksIssued = 0;

  constructor(private readonly now: Date) {
    this.users = [lucasAdmin(now), bia(now), pedroSuspended(now)];
    this.invitations = [marinaInvited(now), joaoExpired(now)];
  }

  directory(): Promise<Answers['directory']> {
    return this.answers.reply('directory', null, () =>
      ok({ users: [...this.users], invitations: [...this.invitations] }),
    );
  }

  invite(input: CreateInvitationRequestDto): Promise<Answers['invite']> {
    return this.answers.reply('invite', input, () => {
      const invitation: AdminInvitationDto = {
        id: `00000000-0000-4000-8000-${String(this.invitations.length + 1).padStart(12, '0')}`,
        email: input.email,
        role: input.role,
        invitedBy: 'lucas',
        sentAt: this.now.toISOString(),
        expiresAt: new Date(this.now.getTime() + 7 * DAY_MS).toISOString(),
      };
      this.invitations = [invitation, ...this.invitations];
      return ok({ invitation, link: this.link('invite') });
    });
  }

  resendInvitation(invitationId: string): Promise<Answers['resendInvitation']> {
    return this.answers.reply('resendInvitation', invitationId, () => {
      const found = this.invitations.find((invitation) => invitation.id === invitationId);
      if (!found) return { ok: false, failure: { kind: 'not_found' } };
      const renewed = {
        ...found,
        sentAt: this.now.toISOString(),
        expiresAt: new Date(this.now.getTime() + 7 * DAY_MS).toISOString(),
      };
      this.invitations = this.invitations.map((invitation) =>
        invitation.id === invitationId ? renewed : invitation,
      );
      return ok({ invitation: renewed, link: this.link('invite') });
    });
  }

  cancelInvitation(invitationId: string): Promise<Answers['cancelInvitation']> {
    return this.answers.reply('cancelInvitation', invitationId, () => {
      this.invitations = this.invitations.filter((invitation) => invitation.id !== invitationId);
      return ok(null);
    });
  }

  changeRole(userId: string, role: UserRoleDto): Promise<Answers['changeRole']> {
    return this.answers.reply('changeRole', { userId, role }, () => this.patch(userId, { role }));
  }

  suspend(userId: string): Promise<Answers['suspend']> {
    return this.answers.reply('suspend', userId, () => this.patch(userId, { status: 'suspended' }));
  }

  reactivate(userId: string): Promise<Answers['reactivate']> {
    return this.answers.reply('reactivate', userId, () => this.patch(userId, { status: 'active' }));
  }

  sendPasswordLink(userId: string): Promise<Answers['sendPasswordLink']> {
    return this.answers.reply('sendPasswordLink', userId, () =>
      ok({
        link: this.link('reset-password'),
        expiresAt: new Date(this.now.getTime() + HOUR_MS).toISOString(),
      }),
    );
  }

  deletionCheck(userId: string): Promise<Answers['deletionCheck']> {
    return this.answers.reply('deletionCheck', userId, () => {
      const user = this.users.find((candidate) => candidate.id === userId);
      return ok({ blockingCampaigns: [], soloCampaigns: user?.campaignCount ?? 0 });
    });
  }

  deleteUser(userId: string): Promise<Answers['deleteUser']> {
    return this.answers.reply('deleteUser', userId, () => {
      this.users = this.users.filter((user) => user.id !== userId);
      return ok(null);
    });
  }

  mailSamples(): Promise<Answers['mailSamples']> {
    return this.answers.reply('mailSamples', null, () => ok([...MAIL_SAMPLES]));
  }

  sendMailSample(sampleId: string, to: string): Promise<Answers['sendMailSample']> {
    return this.answers.reply('sendMailSample', { sampleId, to }, () => {
      const sample = MAIL_SAMPLES.find((each) => each.id === sampleId);
      if (!sample) return { ok: false, failure: { kind: 'not_found' } };
      return ok({ subject: sample.subject, to });
    });
  }

  private link(path: 'invite' | 'reset-password'): string {
    this.linksIssued += 1;
    return `https://mesa.example.com/${path}#token=tok-${this.linksIssued}`;
  }

  private patch(userId: string, changes: Partial<AdminUserDto>): UserAdminResult<AdminUserDto> {
    const found = this.users.find((user) => user.id === userId);
    if (!found) return { ok: false, failure: { kind: 'not_found' } };
    const changed = { ...found, ...changes };
    this.users = this.users.map((user) => (user.id === userId ? changed : user));
    return ok(changed);
  }
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}
