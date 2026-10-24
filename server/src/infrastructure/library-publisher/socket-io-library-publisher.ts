import type { LibraryChangedDto, SceneActivatedDto } from '@lorkarium/contracts';
import type { LibraryPublisherPort } from '../../modules/library/library-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { campaignRoom } from '../../realtime/rooms';

/** Emits each library change to the room of its table, and only there (spec §2.6).
 *
 *  Example: `new SocketIoLibraryPublisher(realtime.io).libraryChanged({ campaignId, at })` */
export class SocketIoLibraryPublisher implements LibraryPublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  libraryChanged(event: LibraryChangedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('library:changed', event);
  }

  sceneActivated(event: SceneActivatedDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('scene:activated', event);
  }
}
