import type { RealtimeSocketData } from '../../src/realtime/realtime-server';
import { VHARN_ID } from './campaigns-factories';

/** One connection as an adapter sees it: its rooms, its data and what it was told. Each join and
 *  leave is also written to `journal` (`join:<room>`, `leave:<room>`), shared with the rooms fake
 *  to read the order of moves and emits.
 *
 *  Example: `new TableSocketFake(BIA_ID, new Set([campaignRoom(VHARN_ID)]))` */
export class TableSocketFake {
  readonly told: Array<Readonly<{ name: string; payload: unknown }>> = [];
  readonly data: Pick<RealtimeSocketData, 'user' | 'watchedSceneIds' | 'campaignIds'>;

  constructor(
    userId: string,
    readonly rooms: Set<string>,
    watched: readonly string[] = [],
    private readonly journal: string[] = [],
  ) {
    const user = {
      ...{ id: userId, username: userId, email: `${userId}@vharn.test`, name: userId },
      ...{ role: 'user' as const, color: 'gold' as const, avatarId: null },
    };
    const watchedSceneIds = new Map([[VHARN_ID, new Set(watched)]]);
    this.data = { user, watchedSceneIds, campaignIds: new Set([VHARN_ID]) };
  }

  join(rooms: string | string[]): void {
    for (const room of [rooms].flat()) {
      this.journal.push(`join:${room}`);
      this.rooms.add(room);
    }
  }

  leave(room: string): void {
    this.journal.push(`leave:${room}`);
    this.rooms.delete(room);
  }

  emit(name: string, payload: unknown): void {
    this.told.push({ name, payload });
  }
}

/** The `io.in(room).fetchSockets()` and `io.to(room).emit(...)` of an adapter over in-memory
 *  sockets; each emit is kept in `emitted` and written to `journal` as `emit:<room>:<name>`.
 *
 *  Example: `new SocketIoSessionPublisher(new RealtimeRoomsFake([bia]) as unknown as RealtimeServer)` */
export class RealtimeRoomsFake {
  readonly emitted: Array<Readonly<{ room: string; name: string; payload: unknown }>> = [];

  constructor(
    private readonly sockets: readonly TableSocketFake[],
    private readonly journal: string[] = [],
  ) {}

  in(room: string) {
    return { fetchSockets: async () => this.sockets.filter((socket) => socket.rooms.has(room)) };
  }

  to(room: string) {
    return {
      emit: (name: string, payload: unknown): void => {
        this.journal.push(`emit:${room}:${name}`);
        this.emitted.push({ room, name, payload });
      },
    };
  }
}
