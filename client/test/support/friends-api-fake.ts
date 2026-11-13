import type {
  BlockRequestDto,
  BlockedUserDto,
  FriendDto,
  FriendsOverviewDto,
} from '@lorkarium/contracts';
import type { FriendRequestOutcome, FriendsApi, FriendsResult } from '@/services/friends-api';
import { friendsOverview } from './friends-fixtures';
import { ScriptedAnswers } from './scripted-answers';

type Answers = {
  overview: FriendsResult<FriendsOverviewDto>;
  sendRequest: FriendsResult<FriendRequestOutcome>;
  acceptRequest: FriendsResult<FriendDto>;
  dropRequest: FriendsResult<null>;
  removeFriend: FriendsResult<null>;
  block: FriendsResult<BlockedUserDto>;
  unblock: FriendsResult<null>;
};

const NOT_SCRIPTED = { ok: false, failure: { kind: 'unexpected' } } as const;

/** A `FriendsApi` that answers `overview` with `lists` and every command with what the test
 *  scripted (`answers.answer`, `answers.hold`); an unscripted command answers `unexpected`.
 *
 *  Example: `api.answers.answer('removeFriend', { ok: true, value: null })` */
export class FriendsApiFake implements FriendsApi {
  lists: FriendsOverviewDto = friendsOverview();
  readonly answers = new ScriptedAnswers<Answers>();

  overview(): Promise<FriendsResult<FriendsOverviewDto>> {
    return this.answers.reply('overview', null, () => ({ ok: true, value: this.lists }));
  }

  sendRequest(username: string): Promise<FriendsResult<FriendRequestOutcome>> {
    return this.answers.reply('sendRequest', username, () => NOT_SCRIPTED);
  }

  acceptRequest(userId: string): Promise<FriendsResult<FriendDto>> {
    return this.answers.reply('acceptRequest', userId, () => NOT_SCRIPTED);
  }

  dropRequest(userId: string): Promise<FriendsResult<null>> {
    return this.answers.reply('dropRequest', userId, () => NOT_SCRIPTED);
  }

  removeFriend(userId: string): Promise<FriendsResult<null>> {
    return this.answers.reply('removeFriend', userId, () => NOT_SCRIPTED);
  }

  block(target: BlockRequestDto): Promise<FriendsResult<BlockedUserDto>> {
    return this.answers.reply('block', target, () => NOT_SCRIPTED);
  }

  unblock(userId: string): Promise<FriendsResult<null>> {
    return this.answers.reply('unblock', userId, () => NOT_SCRIPTED);
  }
}
