import type { SheetChangedEventDto } from '@lorkarium/contracts';
import type { SheetPublisherPort } from '../../modules/sheets/sheet-publisher.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import { campaignRoom } from '../../realtime/rooms';

/** Emits each sheet change to the room of its table, and only there (spec §2.6).
 *
 *  Example: `new SocketIoSheetPublisher(realtime.io).sheetChanged({ campaignId, sheetId, version, at })` */
export class SocketIoSheetPublisher implements SheetPublisherPort {
  constructor(private readonly io: RealtimeServer) {}

  sheetChanged(event: SheetChangedEventDto): void {
    this.io.to(campaignRoom(event.campaignId)).emit('sheet:changed', event);
  }
}
