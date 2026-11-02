import type { CharacterDto } from '@lorkarium/contracts';
import type {
  CharacterPublisherPort,
  CharactersChange,
} from '../../modules/characters/character-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { campaignMastersRoom, campaignRoom, campaignUserRoom } from '../../realtime/rooms';

// Who one emit reaches: a room, minus the rooms that already got their own version.
type Audience = Readonly<{ to: string; except: readonly string[]; viewerId: string | null }>;

/** Emits each saved change of the characters to the table's rooms (spec §2.6): whole to the
 *  masters, to each player and controller what they see of it in their own room, redacted to the
 *  rest. A spectator is in none of the user rooms, so a control kept from before a demotion is
 *  inert.
 *
 *  Example: `new SocketIoCharacterPublisher(realtime.io).charactersChanged(change)` */
export class SocketIoCharacterPublisher implements CharacterPublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  charactersChanged(change: CharactersChange): void {
    if (change.characters.length === 0) return;
    const { campaignId } = change;
    const masters = campaignMastersRoom(campaignId);
    const whole = change.characters.map(({ privileged }) => privileged);
    this.io.to(masters).emit('character:changed', { ...baseOf(change), characters: whole });
    const userIds = [...new Set(change.characters.flatMap((view) => view.privilegedUserIds))];
    const userRooms = userIds.map((userId) => campaignUserRoom(campaignId, userId));
    userIds.forEach((viewerId, index) => {
      this.emitTo(change, { to: userRooms[index] ?? '', except: [masters], viewerId });
    });
    const rest = { to: campaignRoom(campaignId), except: [masters, ...userRooms], viewerId: null };
    this.emitTo(change, rest);
  }

  // One event per version for everyone: what they see of it, or that it is not for them.
  private emitTo(change: CharactersChange, audience: Audience): void {
    const target = this.io.to(audience.to).except([...audience.except]);
    const shown = shownTo(change, audience.viewerId);
    if (shown.length > 0) {
      target.emit('character:changed', { ...baseOf(change), characters: shown });
      return;
    }
    const characterId = change.characters[0]?.characterId;
    if (characterId) target.emit('character:removed', { ...baseOf(change), characterId });
  }
}

function baseOf({ campaignId, version, at }: CharactersChange): CharactersChangeBase {
  return { campaignId, version, at };
}

type CharactersChangeBase = Pick<CharactersChange, 'campaignId' | 'version' | 'at'>;

function shownTo(change: CharactersChange, viewerId: string | null): CharacterDto[] {
  return change.characters
    .filter(({ seenByTable }) => seenByTable)
    .map((view) =>
      viewerId !== null && view.privilegedUserIds.includes(viewerId)
        ? view.privileged
        : view.others,
    );
}
