import {
  AlreadyBlockedError,
  AlreadyFriendsError,
  BlockLimitError,
  BlockNotFoundError,
  FriendLimitError,
  FriendNotFoundError,
  FriendRequestNotFoundError,
  OutgoingRequestLimitError,
  RequestAlreadySentError,
  RequestToSelfError,
  UserBlockedByYouError,
} from './friends.error';

/** Everything between the account acting (`actor`) and the other one (`target`), read under the
 *  lock of both accounts; the counts are the actor's unless named after the target. */
export type FriendRelationState = Readonly<{
  actorId: string;
  targetId: string;
  friends: boolean;
  /** The actor has a pending request to the target. */
  actorAsked: boolean;
  /** The target has a pending request to the actor. */
  targetAsked: boolean;
  /** The actor blocked the target. */
  actorBlocked: boolean;
  /** The target blocked the actor: never revealed to the actor. */
  targetBlocked: boolean;
  actorFriendCount: number;
  targetFriendCount: number;
  actorOutgoingCount: number;
  actorBlockCount: number;
}>;

/** The ceilings, passed in (`FRIENDS_MAX`, `OUTGOING_REQUESTS_MAX`, `BLOCKS_MAX`): the BO does
 *  not read the contract. */
export type FriendLimits = Readonly<{ friendsMax: number; outgoingMax: number; blocksMax: number }>;

/** `send-silently`: the target blocked the actor; the request is kept (so it answers `sent` and
 *  shows in the actor's outgoing) but never reaches the target. */
export type RequestAction = 'send' | 'send-silently' | 'accept-incoming';

/** A decision and the accounts to tell (`friends:changed`) once it is saved. */
export type RelationDecision<Action> = Readonly<{ action: Action; notify: readonly string[] }>;

/** What blocking undoes: the friendship and every request of the pair, both directions. */
export type BlockAction = Readonly<{ endsFriendship: boolean; dropsRequests: boolean }>;

/** Decides each action of the friends screen from the relation of the two accounts, without I/O.
 *  A block weighs both ways, but the blocked account is never told.
 *
 *  Example: `new FriendRelationBo(state, limits).request().action // 'accept-incoming'` */
export class FriendRelationBo {
  constructor(
    private readonly state: FriendRelationState,
    private readonly limits: FriendLimits,
  ) {}

  /** A request by @: the other one having asked first makes it an acceptance.
   *
   *  Example: `relation.request() // { action: 'send', notify: [actorId, targetId] }` */
  request(): RelationDecision<RequestAction> {
    const { actorId, targetId, friends, actorAsked, targetBlocked } = this.state;
    this.requireOther();
    if (this.state.actorBlocked) throw new UserBlockedByYouError(actorId, targetId);
    if (friends) throw new AlreadyFriendsError(actorId, targetId);
    if (actorAsked) throw new RequestAlreadySentError(actorId, targetId);
    if (this.state.targetAsked && !targetBlocked) return this.acceptance('accept-incoming');
    this.requireActorRoom();
    this.requireOutgoingRoom();
    if (targetBlocked) return { action: 'send-silently', notify: [actorId] };
    return { action: 'send', notify: [actorId, targetId] };
  }

  /** Accepting the request the target sent; one from an account the actor blocked is not seen.
   *
   *  Example: `relation.accept().notify // [actorId, targetId]` */
  accept(): RelationDecision<'accept'> {
    const { actorId, targetId, targetAsked, actorBlocked } = this.state;
    if (!targetAsked || actorBlocked) throw new FriendRequestNotFoundError(actorId, targetId);
    return this.acceptance('accept');
  }

  /** Declining a received request or cancelling a sent one: both directions go.
   *
   *  Example: `relation.withdraw().notify // [actorId, targetId]` */
  withdraw(): RelationDecision<'withdraw'> {
    const { actorId, targetId, actorAsked, targetAsked, targetBlocked } = this.state;
    if (!actorAsked && !targetAsked) throw new FriendRequestNotFoundError(actorId, targetId);
    const targetSees = !targetBlocked;
    return { action: 'withdraw', notify: targetSees ? [actorId, targetId] : [actorId] };
  }

  /** Example: `relation.unfriend().notify // [actorId, targetId]` */
  unfriend(): RelationDecision<'unfriend'> {
    const { actorId, targetId, friends } = this.state;
    if (!friends) throw new FriendNotFoundError(actorId, targetId);
    return { action: 'unfriend', notify: [actorId, targetId] };
  }

  /** Blocking needs no consent; the target is told only when something they saw goes away (the
   *  friend, a request), and never why.
   *
   *  Example: `relation.block().action // { endsFriendship: true, dropsRequests: false }` */
  block(): RelationDecision<BlockAction> {
    const { actorId, targetId, friends, actorAsked, targetAsked } = this.state;
    this.requireOther();
    if (this.state.actorBlocked) throw new AlreadyBlockedError(actorId, targetId);
    const { actorBlockCount } = this.state;
    const { blocksMax } = this.limits;
    if (actorBlockCount >= blocksMax)
      throw new BlockLimitError(actorId, actorBlockCount, blocksMax);
    const targetSaw = friends || actorAsked || (targetAsked && !this.state.targetBlocked);
    const action = { endsFriendship: friends, dropsRequests: actorAsked || targetAsked };
    return { action, notify: targetSaw ? [actorId, targetId] : [actorId] };
  }

  /** Unblocking never brings the friendship back.
   *
   *  Example: `relation.unblock().notify // [actorId]` */
  unblock(): RelationDecision<'unblock'> {
    const { actorId, targetId, actorBlocked } = this.state;
    if (!actorBlocked) throw new BlockNotFoundError(actorId, targetId);
    return { action: 'unblock', notify: [actorId] };
  }

  private acceptance<Action extends RequestAction | 'accept'>(
    action: Action,
  ): RelationDecision<Action> {
    this.requireActorRoom();
    const { targetId, targetFriendCount } = this.state;
    const { friendsMax } = this.limits;
    if (targetFriendCount >= friendsMax) {
      throw new FriendLimitError(targetId, targetFriendCount, friendsMax);
    }
    return { action, notify: [this.state.actorId, targetId] };
  }

  private requireActorRoom(): void {
    const { actorId, actorFriendCount } = this.state;
    const { friendsMax } = this.limits;
    if (actorFriendCount >= friendsMax)
      throw new FriendLimitError(actorId, actorFriendCount, friendsMax);
  }

  private requireOutgoingRoom(): void {
    const { actorId, actorOutgoingCount } = this.state;
    const { outgoingMax } = this.limits;
    if (actorOutgoingCount >= outgoingMax) {
      throw new OutgoingRequestLimitError(actorId, actorOutgoingCount, outgoingMax);
    }
  }

  private requireOther(): void {
    if (this.state.actorId === this.state.targetId)
      throw new RequestToSelfError(this.state.actorId);
  }
}
