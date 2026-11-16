import {
  typedUsernameDto,
  type ProfileCardDto,
  type ReputationSummaryDto,
  type ReputationVoteValue,
  type UserReportRequestDto,
} from '@lorkarium/contracts';
import type { AccountResult } from '@/services/account-failure';
import type {
  ProfileCardApi,
  ProfileCardLoadFailure,
  ProfileLookupFailure,
  ReputationFailure,
  UserReportFailure,
} from '@/services/profile-card-api';
import { LYRA_CARD } from './profile-card-fixtures';
import { ScriptedAnswers } from './scripted-answers';

type Answers = {
  card: AccountResult<ProfileCardDto, ProfileCardLoadFailure>;
  cardByUsername: AccountResult<ProfileCardDto, ProfileLookupFailure>;
  vote: AccountResult<null, ReputationFailure>;
  removeVote: AccountResult<null, ReputationFailure>;
  report: AccountResult<null, UserReportFailure>;
};

/** A `ProfileCardApi` over the cards in `cards` (Lyra's by default): a vote changes the card's
 *  counts and `myVote` like the server would, and a report is accepted. `cardByUsername` finds a
 *  card by its @ as the server does (without "@", any case). Any method can be scripted
 *  (`answers.answer`, `answers.hold`); an unknown id or @ answers `user_not_found`.
 *
 *  Example: `api.answers.answer('report', { ok: false, failure: { kind: 'report_already_open' } })` */
export class ProfileCardApiFake implements ProfileCardApi {
  readonly cards = new Map<string, ProfileCardDto>([[LYRA_CARD.id, LYRA_CARD]]);
  readonly answers = new ScriptedAnswers<Answers>();

  put(card: ProfileCardDto): this {
    this.cards.set(card.id, card);
    return this;
  }

  card(userId: string): Promise<Answers['card']> {
    return this.answers.reply('card', userId, () => {
      const card = this.cards.get(userId);
      return card ? { ok: true, value: card } : { ok: false, failure: { kind: 'user_not_found' } };
    });
  }

  cardByUsername(typed: string): Promise<Answers['cardByUsername']> {
    return this.answers.reply('cardByUsername', typed, () => {
      const username = typedUsernameDto.safeParse(typed).data;
      const card = [...this.cards.values()].find((each) => each.username === username);
      return card ? { ok: true, value: card } : { ok: false, failure: { kind: 'user_not_found' } };
    });
  }

  vote(userId: string, value: ReputationVoteValue): Promise<Answers['vote']> {
    return this.answers.reply('vote', { userId, value }, () => this.revote(userId, value));
  }

  removeVote(userId: string): Promise<Answers['removeVote']> {
    return this.answers.reply('removeVote', userId, () => this.revote(userId, null));
  }

  report(userId: string, report: UserReportRequestDto): Promise<Answers['report']> {
    return this.answers.reply('report', { userId, report }, () => ({ ok: true, value: null }));
  }

  private revote(
    userId: string,
    value: ReputationVoteValue | null,
  ): AccountResult<null, ReputationFailure> {
    const card = this.cards.get(userId);
    if (!card) return { ok: false, failure: { kind: 'user_not_found' } };
    this.cards.set(userId, { ...card, reputation: recounted(card.reputation, value) });
    return { ok: true, value: null };
  }
}

function recounted(
  summary: ReputationSummaryDto,
  value: ReputationVoteValue | null,
): ReputationSummaryDto {
  const up = summary.up - (summary.myVote === 1 ? 1 : 0) + (value === 1 ? 1 : 0);
  const down = summary.down - (summary.myVote === -1 ? 1 : 0) + (value === -1 ? 1 : 0);
  const total = up + down;
  return { up, down, myVote: value, percent: total < 5 ? null : Math.round((up / total) * 100) };
}
