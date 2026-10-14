// Propositalmente errado: pasta de módulo sem *.plugin.ts.
import type { FastifyInstance } from 'fastify';
import { renameCampaignDto } from '@fixture/contracts';
import { campaignRoutes } from '../campaigns/campaigns.routes';

export async function orphanRoutes(app: FastifyInstance): Promise<void> {
  void campaignRoutes;
  app.get('/orphan', async () => renameCampaignDto.shape);
}
