import type {
  CampaignMemberDto,
  CampaignRoleDto,
  CampaignDetailDto,
  CampaignSummaryDto,
  CreateCampaignRequestDto,
  JoinCampaignRequestDto,
} from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import type { CampaignsApi, CampaignsResult } from '@/services/campaigns-api';

export const VHARN: CampaignSummaryDto = {
  id: '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10',
  name: 'Os Sinos de Vharn',
  system: 'D&D 5e',
  status: 'Recrutando',
  description: 'Um sino toca sozinho na torre de Vharn.',
  visibility: 'private',
  myRole: 'master',
  masterName: 'Ana',
  memberCount: 3,
  lastEnteredAt: '2026-10-13T22:30:00.000Z',
};

export const QUELM: CampaignSummaryDto = {
  id: '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f',
  name: 'Contrato no Pântano',
  system: 'Tormenta20',
  status: null,
  description: null,
  visibility: 'public',
  myRole: 'player',
  masterName: 'Bia',
  memberCount: 4,
  lastEnteredAt: null,
};

// The same ids as the roster fixtures (`table-session-fixtures.ts`), so a member of the detail and
// of the live table is the same person.
const MEMBER_IDS: Readonly<Record<string, string>> = {
  Ana: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01',
  Bia: '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f',
  Caio: 'b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f',
  Duda: '1e2d3c4b-5a69-4788-9abc-def012345678',
  Edu: '5f6e7d8c-9b0a-4c1d-8e2f-3a4b5c6d7e8f',
};

const UNKNOWN_MEMBER_ID = '00000000-0000-4000-8000-0000000000ff';

function detailMemberOf(name: string, role: CampaignRoleDto): CampaignMemberDto {
  const userId = MEMBER_IDS[name] ?? UNKNOWN_MEMBER_ID;
  return { userId, name, role, color: memberColorOf(userId, null), avatarId: null };
}

/** A detail built on a summary: master first, the code only for the master.
 *
 *  Example: `detailOf(QUELM).joinCode // null` */
export function detailOf(
  summary: CampaignSummaryDto,
  overrides: Partial<CampaignDetailDto> = {},
): CampaignDetailDto {
  const playerNames =
    summary.masterName === 'Ana' ? ['Caio', 'Duda', 'Edu'] : ['Ana', 'Caio', 'Duda'];
  const others = playerNames
    .slice(0, summary.memberCount - 1)
    .map((name) => detailMemberOf(name, 'player'));
  return {
    ...summary,
    members: [detailMemberOf(summary.masterName, 'master'), ...others],
    joinCode: summary.myRole === 'master' ? 'VHRN7K2Q' : null,
    hasPassword: false,
    castSceneId: '8e4d3c2b-1a0f-4e9d-a8b7-6f5e4d3c2b1a',
    ...overrides,
  };
}

type Answers = {
  list: CampaignsResult<CampaignSummaryDto[]>;
  create: CampaignsResult<CampaignDetailDto>;
  detail: CampaignsResult<CampaignDetailDto>;
  join: CampaignsResult<CampaignSummaryDto>;
  enter: CampaignsResult<null>;
};

type Method = keyof Answers;

type Pending<T> = { promise: Promise<T>; resolve: (value: T) => void };

/** Scripted `CampaignsApi`: each method answers what the test set, or waits until released. */
export class CampaignsApiFake implements CampaignsApi {
  readonly calls: Array<{ method: Method; argument: unknown }> = [];
  private readonly answers: { [M in Method]: Answers[M] | Pending<Answers[M]> } = {
    list: { ok: true, value: [VHARN, QUELM] },
    create: { ok: true, value: detailOf(VHARN) },
    detail: { ok: true, value: detailOf(VHARN) },
    join: { ok: true, value: QUELM },
    enter: { ok: true, value: null },
  };

  answer<M extends Method>(method: M, result: Answers[M]): this {
    this.answers[method] = result as (typeof this.answers)[M];
    return this;
  }

  /** Keeps the next calls of `method` waiting; call the returned function to answer them. */
  hold<M extends Method>(method: M): (result: Answers[M]) => void {
    let resolve: (value: Answers[M]) => void = () => undefined;
    const promise = new Promise<Answers[M]>((settle) => {
      resolve = settle;
    });
    this.answers[method] = { promise, resolve } as (typeof this.answers)[M];
    return resolve;
  }

  callsOf(method: Method): unknown[] {
    return this.calls.filter((call) => call.method === method).map((call) => call.argument);
  }

  list(): Promise<Answers['list']> {
    return this.reply('list', undefined);
  }

  create(input: CreateCampaignRequestDto): Promise<Answers['create']> {
    return this.reply('create', input);
  }

  detail(campaignId: string): Promise<Answers['detail']> {
    return this.reply('detail', campaignId);
  }

  join(input: JoinCampaignRequestDto): Promise<Answers['join']> {
    return this.reply('join', input);
  }

  enter(campaignId: string): Promise<Answers['enter']> {
    return this.reply('enter', campaignId);
  }

  private async reply<M extends Method>(method: M, argument: unknown): Promise<Answers[M]> {
    this.calls.push({ method, argument });
    const answer: Answers[M] | Pending<Answers[M]> = this.answers[method];
    return 'promise' in answer ? answer.promise : answer;
  }
}
