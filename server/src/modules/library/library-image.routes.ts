import type { ImagePresentationService } from './image-presentation.service';
import {
  campaignIdParamsDto,
  createLibraryImageRequestDto,
  updateLibraryImageRequestDto,
  libraryImageParamsDto,
} from '@lorkarium/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { LibraryImageNotFoundError } from './library-image.error';
import type { LibraryImageService } from './library-image.service';
import type { LibraryRequester } from './library.service';
const IMAGES = '/campaigns/:campaignId/library-images';
export function libraryImageRoutes(
  service: LibraryImageService,
  presentations: ImagePresentationService,
): (app: FastifyInstance) => Promise<void> {
  return async (app) => {
    const opts = { preHandler: app.authGuards.requireAuth };
    app.get('/campaigns/:campaignId/library', opts, (request) =>
      service.list(requesterOf(app, request)),
    );
    app.get('/campaigns/:campaignId/image-presentation', opts, (request) =>
      presentations.snapshot(requesterOf(app, request)),
    );
    app.post(IMAGES, opts, async (request, reply) =>
      reply
        .code(201)
        .send(
          await service.create(
            requesterOf(app, request),
            createLibraryImageRequestDto.parse(request.body),
          ),
        ),
    );
    app.patch(`${IMAGES}/:imageId`, opts, (request) =>
      service.update(
        requesterOf(app, request),
        imageIdOf(request),
        updateLibraryImageRequestDto.parse(request.body),
      ),
    );
    app.delete(`${IMAGES}/:imageId`, opts, async (request, reply) => {
      await service.delete(requesterOf(app, request), imageIdOf(request));
      return reply.code(204).send();
    });
    app.post(`${IMAGES}/:imageId/presentations`, opts, (request) =>
      presentations.present(requesterOf(app, request), imageIdOf(request)),
    );
  };
}
function requesterOf(app: FastifyInstance, request: FastifyRequest): LibraryRequester {
  const userId = app.authGuards.userOf(request).id;
  const { campaignId } = request.params as Record<string, unknown>;
  const parsed = campaignIdParamsDto.safeParse({ campaignId });
  if (!parsed.success) throw new CampaignNotFoundError({ campaignId: String(campaignId), userId });
  return { userId, campaignId: parsed.data.campaignId };
}
function imageIdOf(request: FastifyRequest): string {
  const parsed = libraryImageParamsDto.safeParse(request.params);
  if (parsed.success) return parsed.data.imageId;
  throw new LibraryImageNotFoundError(
    String((request.params as Record<string, unknown>).campaignId),
    String((request.params as Record<string, unknown>).imageId),
  );
}
