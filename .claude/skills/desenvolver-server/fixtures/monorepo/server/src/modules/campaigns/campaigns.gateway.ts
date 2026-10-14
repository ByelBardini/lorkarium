import type { Socket } from 'socket.io';
import { renameCampaignDto } from '@fixture/contracts';
import type { CampaignsService } from './campaigns.service';

/** Realtime edge of campaigns: the author comes from the authenticated socket.
 *
 *  Example: `campaignGateway(service)(socket)` */
export function campaignGateway(service: CampaignsService): (socket: Socket) => void {
  return (socket: Socket): void => {
    socket.on('campaign:rename', async (payload: unknown, ack: (answer: unknown) => void) => {
      const input = renameCampaignDto.parse(payload);
      ack(await service.rename(socket.data.userId, input.campaignId, input.name));
    });
  };
}
