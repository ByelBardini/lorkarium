import {
  createSheetRequestDto,
  deleteSheetRequestDto,
  setMainSheetCommandDto,
  sheetParamsDto,
  tokenSheetParamsDto,
  updateSheetRequestDto,
  updateSheetValuesRequestDto,
  type SheetResponseDto,
  type TokenSheetsResponseDto,
  type SheetWriteResponseDto,
  createSheetTemplateRequestDto,
  sheetTemplateParamsDto,
  updateSheetTemplateRequestDto,
  type ApiErrorDto,
  type SheetTemplateResponseDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { CampaignError, CampaignNotFoundError } from '../campaigns/campaigns.error';
import { CharacterError, CharacterNotFoundError } from '../characters/characters.error';
import { LibraryError } from '../library/library.error';
import type { LibraryRequester } from '../library/library.service';
import { TokenError, TokenNotFoundError } from '../tokens/tokens.error';
import type { SheetTemplatesService } from './sheet-templates.service';
import type { SheetsService } from './sheets.service';
import {
  SheetError,
  SheetNotFoundError,
  SheetTemplateNotFoundError,
  type SheetErrorCode,
} from './sheets.error';

const TEMPLATES = '/campaigns/:campaignId/sheet-templates';
const TEMPLATE = `${TEMPLATES}/:templateId`;
const SHEETS = '/campaigns/:campaignId/sheets';
const SHEET = `${SHEETS}/:sheetId`;
const TOKEN_SHEETS = '/campaigns/:campaignId/tokens/:tokenId/sheets';
const CHARACTER_SHEETS = '/campaigns/:campaignId/characters/:characterId/sheets';
// The code of a template is at most 512 KiB of source (the values 256 KiB of JSON); escaping
// may double either.
const BODY_LIMIT = 2 * 1024 * 1024;

const STATUS_BY_CODE: Readonly<Record<SheetErrorCode, number>> = {
  SHEET_TEMPLATE_NOT_FOUND: 404,
  SHEET_TEMPLATE_VERSION_CONFLICT: 409,
  SHEET_TEMPLATE_IN_USE: 409,
  SHEET_NOT_FOUND: 404,
  SHEET_ACTION_REUSED: 409,
  SHEET_HAS_NO_TOKEN: 409,
};
// Public text only, except the count of sheets, which the master who asked may know.
const PUBLIC_MESSAGE: Readonly<Record<SheetErrorCode, string | null>> = {
  SHEET_TEMPLATE_NOT_FOUND: 'Sheet template not found',
  SHEET_TEMPLATE_VERSION_CONFLICT: 'Another master saved this template first',
  SHEET_TEMPLATE_IN_USE: null,
  SHEET_NOT_FOUND: 'Sheet not found',
  SHEET_ACTION_REUSED: 'This action was already used for another command',
  SHEET_HAS_NO_TOKEN: 'This sheet is not held by a token',
};

export type SheetServices = Readonly<{ templates: SheetTemplatesService; sheets: SheetsService }>;

/** The HTTP edge of the sheets, nested in the table (§2.6): the templates of the library and the
 *  sheets held by tokens and characters.
 *
 *  Example: `await app.register(sheetsRoutes({ templates, sheets }), { prefix: '/api' })` */
export function sheetsRoutes(services: SheetServices): (app: FastifyInstance) => Promise<void> {
  return async (app) => {
    app.setErrorHandler(sheetErrorReply);
    app.addHook('onSend', async (_request, reply, payload) => {
      reply.header('cache-control', 'private, no-store');
      return payload;
    });
    registerTemplateRoutes(app, services.templates);
    registerSheetReads(app, services.sheets);
    registerSheetWrites(app, services.sheets);
  };
}

function registerSheetReads(app: FastifyInstance, sheets: SheetsService): void {
  const options = { preHandler: app.authGuards.requireAuth };
  app.get(SHEET, options, async (request): Promise<SheetResponseDto> => {
    const requester = requesterOf(app, request);
    return sheets.get(requester, sheetIdOf(request, requester));
  });
  app.get(TOKEN_SHEETS, options, async (request): Promise<TokenSheetsResponseDto> => {
    const requester = requesterOf(app, request);
    const { tokenId } = request.params as Readonly<Record<string, unknown>>;
    const parsed = tokenSheetParamsDto.shape.tokenId.safeParse(tokenId);
    if (!parsed.success) throw new TokenNotFoundError(requester.campaignId, String(tokenId));
    return sheets.listOfToken(requester, parsed.data);
  });
  app.get(CHARACTER_SHEETS, options, async (request): Promise<TokenSheetsResponseDto> => {
    const requester = requesterOf(app, request);
    return sheets.listOfCharacter(requester, characterIdOf(request, requester));
  });
}

// The character's id has the shape of the one `character:setMainSheet` carries.
function characterIdOf(request: FastifyRequest, requester: LibraryRequester): string {
  const { characterId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = setMainSheetCommandDto.shape.characterId.safeParse(characterId);
  if (parsed.success) return parsed.data;
  throw new CharacterNotFoundError(requester.campaignId, String(characterId));
}

function registerSheetWrites(app: FastifyInstance, sheets: SheetsService): void {
  const options = { preHandler: app.authGuards.requireAuth, bodyLimit: BODY_LIMIT };
  app.post(SHEETS, options, async (request, reply) => {
    const input = createSheetRequestDto.parse(request.body);
    const written = await sheets.create(requesterOf(app, request), input);
    return reply.code(201).send(written satisfies SheetWriteResponseDto);
  });
  app.patch(`${SHEET}/values`, options, async (request): Promise<SheetWriteResponseDto> => {
    const requester = requesterOf(app, request);
    const input = updateSheetValuesRequestDto.parse(request.body);
    return sheets.updateValues(requester, sheetIdOf(request, requester), input);
  });
  app.patch(SHEET, options, async (request): Promise<SheetWriteResponseDto> => {
    const requester = requesterOf(app, request);
    const input = updateSheetRequestDto.parse(request.body);
    return sheets.update(requester, sheetIdOf(request, requester), input);
  });
  app.delete(SHEET, options, async (request, reply) => {
    const requester = requesterOf(app, request);
    const input = deleteSheetRequestDto.parse(request.body);
    await sheets.delete(requester, sheetIdOf(request, requester), input);
    return reply.code(204).send();
  });
}

function sheetIdOf(request: FastifyRequest, requester: LibraryRequester): string {
  const { sheetId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = sheetParamsDto.shape.sheetId.safeParse(sheetId);
  if (parsed.success) return parsed.data;
  throw new SheetNotFoundError(requester.campaignId, `sheet ${String(sheetId)}`);
}

function registerTemplateRoutes(app: FastifyInstance, templates: SheetTemplatesService): void {
  const options = { preHandler: app.authGuards.requireAuth, bodyLimit: BODY_LIMIT };
  app.post(TEMPLATES, options, async (request, reply) => {
    const input = createSheetTemplateRequestDto.parse(request.body);
    const template = await templates.create(requesterOf(app, request), input);
    return reply.code(201).send({ template } satisfies SheetTemplateResponseDto);
  });
  app.get(TEMPLATE, options, async (request): Promise<SheetTemplateResponseDto> => {
    const requester = requesterOf(app, request);
    return { template: await templates.get(requester, templateIdOf(request, requester)) };
  });
  app.patch(TEMPLATE, options, async (request): Promise<SheetTemplateResponseDto> => {
    const requester = requesterOf(app, request);
    const input = updateSheetTemplateRequestDto.parse(request.body);
    const templateId = templateIdOf(request, requester);
    return { template: await templates.update(requester, templateId, input) };
  });
  app.delete(TEMPLATE, options, async (request, reply) => {
    const requester = requesterOf(app, request);
    await templates.delete(requester, templateIdOf(request, requester));
    return reply.code(204).send();
  });
}

// A malformed id finds nothing, exactly like an id of another table (critério 14).
function requesterOf(app: FastifyInstance, request: FastifyRequest): LibraryRequester {
  const userId = app.authGuards.userOf(request).id;
  const { campaignId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = sheetTemplateParamsDto.shape.campaignId.safeParse(campaignId);
  if (parsed.success) return { userId, campaignId: parsed.data };
  throw new CampaignNotFoundError({ campaignId: String(campaignId), userId });
}

function templateIdOf(request: FastifyRequest, requester: LibraryRequester): string {
  const { templateId } = request.params as Readonly<Record<string, unknown>>;
  const parsed = sheetTemplateParamsDto.shape.templateId.safeParse(templateId);
  if (parsed.success) return parsed.data;
  throw new SheetTemplateNotFoundError(requester.campaignId, String(templateId));
}

function domainReplyOf(error: unknown): Readonly<{ status: number; body: ApiErrorDto }> | null {
  if (error instanceof SheetError) {
    const message = PUBLIC_MESSAGE[error.code] ?? error.message;
    return { status: STATUS_BY_CODE[error.code], body: { code: error.code, message } };
  }
  if (error instanceof CampaignError && error.code === 'FORBIDDEN') {
    const message = 'Your role at this table does not allow it';
    return { status: 403, body: { code: error.code, message } };
  }
  if (error instanceof CampaignError && error.code === 'MEMBER_NOT_FOUND')
    return { status: 404, body: { code: error.code, message: 'Player not found at this table' } };
  if (error instanceof CampaignError)
    return { status: 404, body: { code: error.code, message: 'Campaign not found' } };
  if (error instanceof LibraryError)
    return { status: 404, body: { code: error.code, message: 'Folder not found' } };
  if (error instanceof TokenError)
    return { status: 404, body: { code: error.code, message: 'Token not found' } };
  if (error instanceof CharacterError)
    return { status: 404, body: { code: error.code, message: 'Character not found' } };
  return null;
}

async function sheetErrorReply(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const domain = domainReplyOf(error);
  if (domain) return reply.code(domain.status).send(domain.body);
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500)
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  request.log.error({ err: error }, 'unexpected error in the sheets module');
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
}
