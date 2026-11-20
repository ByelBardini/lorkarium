import type {
  AccountSanctionDto,
  AdminUserDto,
  IssueSanctionRequestDto,
  RecordAppealRequestDto,
  SanctionResponseDto,
} from '@lorkarium/contracts';
import type { SanctionsApi } from '@/services/sanctions-api';
import type { UserAdminResult } from '@/services/user-admin-api';
import { ScriptedAnswers } from './scripted-answers';
import { bia, type UserAdminApiFake } from './user-admin-api-fake';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A spam warning on Bia by @lucas, two days before `now`, no appeal. */
export function biaWarning(now: Date): AccountSanctionDto {
  return {
    id: '5a0c7100-0000-4000-8000-000000000001',
    kind: 'warning',
    rule: 'spam',
    statement: 'Mandou propaganda a quem não é amigo.',
    until: null,
    reportId: null,
    issuedBy: 'lucas',
    issuedAt: new Date(now.getTime() - 2 * DAY_MS).toISOString(),
    appeal: null,
  };
}

type Answers = {
  issue: UserAdminResult<SanctionResponseDto | null>;
  history: UserAdminResult<AccountSanctionDto[]>;
  recordAppeal: UserAdminResult<SanctionResponseDto>;
};

/** A `SanctionsApi` that keeps each account's measures like the server would and changes the
 *  directory of the `UserAdminApiFake` with them (a suspension, a ban, a reverted appeal); any
 *  method can be scripted by `answers`. Bia starts with one warning (`biaWarning`). */
export class SanctionsApiFake implements SanctionsApi {
  readonly answers = new ScriptedAnswers<Answers>();
  readonly measures = new Map<string, AccountSanctionDto[]>();
  private issued = 1;

  constructor(
    private readonly now: Date,
    private readonly directory: UserAdminApiFake,
  ) {
    this.measures.set(bia(now).id, [biaWarning(now)]);
  }

  issue(userId: string, body: IssueSanctionRequestDto): Promise<Answers['issue']> {
    return this.answers.reply('issue', { userId, body }, () => {
      const user = this.directory.users.find((each) => each.id === userId);
      if (!user) return { ok: false, failure: { kind: 'not_found' } };
      if (body.kind === 'ban') {
        this.directory.users = this.directory.users.filter((each) => each.id !== userId);
        return { ok: true, value: null };
      }
      const sanction = this.stored(userId, body);
      const status = body.kind === 'suspension' ? 'suspended' : user.status;
      return { ok: true, value: { sanction, user: this.patch(user, status) } };
    });
  }

  history(userId: string): Promise<Answers['history']> {
    return this.answers.reply('history', userId, () => ({
      ok: true,
      value: [...(this.measures.get(userId) ?? [])],
    }));
  }

  recordAppeal(sanctionId: string, body: RecordAppealRequestDto): Promise<Answers['recordAppeal']> {
    return this.answers.reply('recordAppeal', { sanctionId, body }, () => {
      const owner = [...this.measures.entries()].find(([, list]) =>
        list.some((each) => each.id === sanctionId),
      );
      const user = this.directory.users.find((each) => each.id === owner?.[0]);
      if (!owner || !user) return { ok: false, failure: { kind: 'not_found' } };
      const sanction = this.appealed(owner[1], sanctionId, body);
      const lifted = body.outcome === 'reverted' && sanction.kind === 'suspension';
      return {
        ok: true,
        value: { sanction, user: this.patch(user, lifted ? 'active' : user.status) },
      };
    });
  }

  private stored(userId: string, body: IssueSanctionRequestDto): AccountSanctionDto {
    const sanction: AccountSanctionDto = {
      id: `5a0c7100-0000-4000-8000-${String((this.issued += 1)).padStart(12, '0')}`,
      kind: body.kind,
      rule: body.rule,
      statement: body.statement,
      until: body.until ?? null,
      reportId: body.reportId ?? null,
      issuedBy: 'lucas',
      issuedAt: this.now.toISOString(),
      appeal: null,
    };
    this.measures.set(userId, [sanction, ...(this.measures.get(userId) ?? [])]);
    return sanction;
  }

  private appealed(
    list: AccountSanctionDto[],
    sanctionId: string,
    body: RecordAppealRequestDto,
  ): AccountSanctionDto {
    const at = list.findIndex((each) => each.id === sanctionId);
    const found = list[at] as AccountSanctionDto;
    const receivedAt = found.appeal?.receivedAt ?? this.now.toISOString();
    const decided =
      body.outcome === 'received'
        ? { outcome: null, note: null, decidedBy: null, decidedAt: null }
        : {
            outcome: body.outcome,
            note: body.note,
            decidedBy: 'lucas',
            decidedAt: this.now.toISOString(),
          };
    const changed = { ...found, appeal: { receivedAt, ...decided } };
    list[at] = changed;
    return changed;
  }

  private patch(user: AdminUserDto, status: AdminUserDto['status']): AdminUserDto {
    const changed = { ...user, status };
    this.directory.users = this.directory.users.map((each) =>
      each.id === user.id ? changed : each,
    );
    return changed;
  }
}
