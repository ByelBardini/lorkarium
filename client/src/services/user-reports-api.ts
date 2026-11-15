import {
  listUserReportsQueryDto,
  resolveUserReportRequestDto,
  userReportResponseDto,
  userReportsPageDto,
  type ListUserReportsQueryDto,
  type ResolveUserReportRequestDto,
  type UserReportDto,
  type UserReportsPageDto,
} from '@lorkarium/contracts';
import { callApi, parseOk } from './api-call';
import type { HttpTransport } from './http-transport';
import { userAdminFailureOf, type UserAdminResult } from './user-admin-api';

/** The backoffice queue of user reports (`/api/admin/reports`); failures come back as values.
 *  The failures are the backoffice's own (`UserAdminFailure`): the same guard answers both. */
export interface UserReportsApi {
  list(query: ListUserReportsQueryDto): Promise<UserAdminResult<UserReportsPageDto>>;
  resolve(
    reportId: string,
    request: ResolveUserReportRequestDto,
  ): Promise<UserAdminResult<UserReportDto>>;
}

/** `UserReportsApi` over HTTP: the query and body pass their DTO before leaving, the answers after.
 *
 *  Example: `await new HttpUserReportsApi(transport).list({ status: 'open', page: 1 })` */
export class HttpUserReportsApi implements UserReportsApi {
  constructor(private readonly transport: HttpTransport) {}

  async list(query: ListUserReportsQueryDto): Promise<UserAdminResult<UserReportsPageDto>> {
    const { status, page } = listUserReportsQueryDto.parse(query);
    const path = `/admin/reports?status=${status}&page=${page}`;
    const call = await callApi(this.transport, 'GET', path);
    if (call.kind !== 'ok') return { ok: false, failure: userAdminFailureOf(call) };
    return parseOk(userReportsPageDto, call.body, (body) => body);
  }

  async resolve(
    reportId: string,
    request: ResolveUserReportRequestDto,
  ): Promise<UserAdminResult<UserReportDto>> {
    const body = resolveUserReportRequestDto.parse(request);
    const path = `/admin/reports/${encodeURIComponent(reportId)}`;
    const call = await callApi(this.transport, 'PATCH', path, body);
    if (call.kind !== 'ok') return { ok: false, failure: userAdminFailureOf(call) };
    return parseOk(userReportResponseDto, call.body, (parsed) => parsed.report);
  }
}
