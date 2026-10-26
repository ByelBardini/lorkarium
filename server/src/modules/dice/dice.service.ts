import {
  DICE_THROW_MODELS_MAX,
  type DiceRollCommandDto,
  type DiceRolledDto,
} from '@lorkarium/contracts';
import {
  continueDiceRoll,
  startDiceRoll,
  type DiceRollResult,
  type DieRequest,
} from '@lorkarium/game-core';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import { memberAccessOf } from '../campaigns/member-access';
import type { ProfilesDao } from '../profiles/profiles.dao';
import type { DicePhysicsPort } from './dice-physics.port';
import type { DicePublisherPort } from './dice-publisher.port';
import type { DiceRandomPort } from './dice-random.port';
import {
  DiceWavesBo,
  audienceOf,
  requireReadableDice,
  revealDelayOf,
  type DiceAudience,
} from './dice-roll.bo';
import { toDiceAppearanceDto, toDiceRolledDto, toDiceRolledSecretlyDto } from './dice.mapper';

export type DiceServiceDeps = Readonly<{
  members: MembershipReader;
  profiles: Pick<ProfilesDao, 'findById'>;
  physics: DicePhysicsPort;
  random: DiceRandomPort;
  publisher: DicePublisherPort;
  clock: ClockPort;
  newId: () => string;
}>;

type ThrownRoll = Readonly<{ result: DiceRollResult; waves: DiceWavesBo }>;

/** The roll of the table: ephemeral, so it writes nothing and moves no version. */
export class DiceService {
  constructor(private readonly deps: DiceServiceDeps) {}

  /** Rolls for a member (never a spectator): the physics throws up to 20 modeled dice per roll,
   *  crypto draws the rest, every explosion or reroll is a new wave 300 ms after the previous one
   *  settles, and the event goes to the table or, masters-only, to the masters and the roller
   *  with a notice without the result to everyone else.
   *
   *  Example: `const { rollId } = await diceService.roll(user.id, command)` */
  async roll(userId: string, command: DiceRollCommandDto): Promise<{ rollId: string }> {
    const access = await memberAccessOf(this.deps.members, command.campaignId, userId);
    const { result, waves } = this.throwAll(command);
    const profile = await this.deps.profiles.findById(userId);
    const event = toDiceRolledDto({
      rollId: this.deps.newId(),
      rollerId: userId,
      command,
      result,
      appearance: toDiceAppearanceDto(userId, profile),
      models: waves.modelsOf(),
      indices: waves.indicesOf(),
      settlesInMs: revealDelayOf(waves.modelsOf()),
      at: this.deps.clock.now().toISOString(),
    });
    this.publish(event, audienceOf(command.visibility, userId, access.isMaster()));
    return { rollId: event.rollId };
  }

  private throwAll(command: DiceRollCommandDto): ThrownRoll {
    const expressions = command.parts.map((part) => part.expression);
    requireReadableDice(expressions);
    const waves = new DiceWavesBo(DICE_THROW_MODELS_MAX);
    let step = startDiceRoll(expressions);
    while (step.kind === 'pending') {
      step = continueDiceRoll(step.state, this.throwWave(waves, step.requests, command.aspect));
    }
    return { result: step.result, waves };
  }

  private throwWave(waves: DiceWavesBo, requests: DieRequest[], aspect: number): number[] {
    const plans = waves.planOf(requests);
    const kinds = plans.flat();
    const startMs = waves.nextStartMs();
    const thrown =
      kinds.length === 0 ? [] : this.deps.physics.throw({ kinds, aspect, startMs }).models;
    const faces = requests
      .filter((_, index) => plans[index]?.length === 0)
      .map((request) => this.deps.random.face(request.sides));
    return waves.land(requests, plans, thrown, faces);
  }

  private publish(event: DiceRolledDto, audience: DiceAudience): void {
    this.deps.publisher.rolled(event, audience);
    if (audience.kind === 'masters') {
      this.deps.publisher.rolledSecretly(toDiceRolledSecretlyDto(event), audience);
    }
  }
}
