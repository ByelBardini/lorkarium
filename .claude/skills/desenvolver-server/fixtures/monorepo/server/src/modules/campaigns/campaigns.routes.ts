import type { FastifyInstance } from 'fastify';
import { renameCampaignDto } from '@fixture/contracts';
import type { CampaignsService } from './campaigns.service';

/** HTTP edge of campaigns: validates the DTO and delegates to the service.
 *
 *  Example: `app.register(campaignRoutes(service))` */
export function campaignRoutes(service: CampaignsService): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    app.patch('/campaigns/:id', async (request) => {
      const input = renameCampaignDto.parse(request.body);
      return service.rename(request.user.id, input.campaignId, input.name);
    });
  };
}
