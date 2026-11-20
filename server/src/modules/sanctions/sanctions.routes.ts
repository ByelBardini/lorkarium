import {
  adminUserParamsDto,
  issueSanctionRequestDto,
  recordAppealRequestDto,
  sanctionParamsDto,
  type AccountSanctionsResponseDto,
  type ApiErrorDto,
  type SanctionResponseDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { OwnsSharedCampaignsError, UserAdminError } from '../user-admin/user-admin.error';
import type { AdminActor } from '../user-admin/user-admin.service';
import { SanctionError, type SanctionErrorCode } from './sanctions.error';
import type { SanctionsService } from './sanctions.service';

const STATUS_BY_CODE: Readonly<Record<SanctionErrorCode, number>> = {
  TARGET_IS_ADMIN: 409,
  ALREADY_SUSPENDED: 409,
  SANCTION_UNTIL_PAST: 400,
  SANCTION_NOT_FOUND: 404,
  SANCTION_REPORT_NOT_FOUND: 404,
  APPEAL_ALREADY_DECIDED: 409,
};

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<SanctionErrorCode, string>> = {
  TARGET_IS_ADMIN: 'An admin account cannot receive a measure; remove the admin role first',
  ALREADY_SUSPENDED: 'The account is already suspended',
  SANCTION_UNTIL_PAST: 'The end of the suspension must be in the future',
  SANCTION_NOT_FOUND: 'Measure not found',
  SANCTION_REPORT_NOT_FOUND: 'Report not found for this account',
  APPEAL_ALREADY_DECIDED: 'The appeal was already decided',
};

// The refusals of the user-admin module a measure can meet (the account, oneself, a ban's tables).
const ACCOUNT_REFUSALS: Readonly<Record<string, Readonly<{ status: number; message: string }>>> = {
  SELF_ACTION: { status: 409, message: 'Admins cannot do this to their own account' },
  USER_NOT_FOUND: { status: 404, message: 'Account not found' },
  OWNS_SHARED_CAMPAIGNS: {
    status: 409,
    message: 'The account owns tables where other people play',
  },
};

/** HTTP edge of the measures, every route for an admin only; each one is logged with the admin,
 *  the target and the kind (never an e-mail nor the statement).
 *
 *  Example: `await app.register(sanctionsRoutes(service), { prefix: '/api' })` */
export function sanctionsRoutes(
  service: SanctionsService,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    app.setErrorHandler(replyWithApiError);
    const admin = { preHandler: app.authGuards.requireRole('admin') };
    app.post('/admin/users/:userId/sanctions', admin, async (request, reply) => {
      const { userId } = adminUserParamsDto.parse(request.params);
      const body = issueSanctionRequestDto.parse(request.body);
      const actor = actorOf(app, request);
      const fields = { adminId: actor.id, targetUserId: userId, kind: body.kind };
      request.log.info({ ...fields, action: 'apply a measure to' }, 'backoffice action');
      const issued = await service.issue(actor, userId, body);
      return reply.code(201).send(issued satisfies SanctionResponseDto);
    });
    app.get('/admin/users/:userId/sanctions', admin, async (request) => {
      const { userId } = adminUserParamsDto.parse(request.params);
      return (await service.history(userId)) satisfies AccountSanctionsResponseDto;
    });
    app.put('/admin/sanctions/:sanctionId/appeal', admin, async (request) => {
      const { sanctionId } = sanctionParamsDto.parse(request.params);
      const body = recordAppealRequestDto.parse(request.body);
      const actor = actorOf(app, request);
      const fields = { adminId: actor.id, sanctionId, outcome: body.outcome };
      request.log.info({ ...fields, action: 'record the appeal of' }, 'backoffice action');
      return (await service.recordAppeal(actor, sanctionId, body)) satisfies SanctionResponseDto;
    });
  };
}

function actorOf(app: FastifyInstance, request: FastifyRequest): AdminActor {
  const user = app.authGuards.userOf(request);
  return { id: user.id, name: user.name };
}

function accountRefusal(error: UserAdminError): Readonly<{ status: number; body: ApiErrorDto }> {
  const known = ACCOUNT_REFUSALS[error.code] ?? { status: 409, message: error.code };
  const blocking =
    error instanceof OwnsSharedCampaignsError
      ? { blockingCampaigns: [...error.blockingCampaigns] }
      : {};
  return { status: known.status, body: { code: error.code, message: known.message, ...blocking } };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof SanctionError) {
    const body = { code: error.code, message: PUBLIC_MESSAGE[error.code] } satisfies ApiErrorDto;
    return reply.code(STATUS_BY_CODE[error.code]).send(body);
  }
  if (error instanceof UserAdminError) {
    const { status, body } = accountRefusal(error);
    return reply.code(status).send(body);
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the sanctions module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
