import { errorReportingSettingsDto } from '@lorkarium/contracts';
import { callApi } from './api-call';
import type { HttpTransport } from './http-transport';

/** Where the browser reports, when the server has Sentry on. */
export type ErrorReportingSettings = Readonly<{
  dsn: string;
  environment: string;
  release: string | null;
}>;

/** How the server answered the admin's test: the 500 it was asked for, or something else. */
export type ServerTestOutcome = 'server-error' | 'unexpected' | 'offline';

/** What the error reports need from `/api/error-reports` and the backoffice test. */
export interface ErrorReportsApi {
  /** null = no DSN, a failure or an answer outside the DTO: the app goes on without reports. */
  settings(): Promise<ErrorReportingSettings | null>;
  /** Asks the server for a 500 on purpose (admin only). */
  triggerServerTest(): Promise<ServerTestOutcome>;
}

/** `ErrorReportsApi` over HTTP: validates the settings by the contracts DTO.
 *
 *  Example: `const settings = await new HttpErrorReportsApi(transport).settings()` */
export class HttpErrorReportsApi implements ErrorReportsApi {
  constructor(private readonly transport: HttpTransport) {}

  async settings(): Promise<ErrorReportingSettings | null> {
    const call = await callApi(this.transport, 'GET', '/error-reports/settings');
    if (call.kind !== 'ok') return null;
    const parsed = errorReportingSettingsDto.safeParse(call.body);
    if (!parsed.success || parsed.data.dsn === null) return null;
    return { ...parsed.data, dsn: parsed.data.dsn };
  }

  async triggerServerTest(): Promise<ServerTestOutcome> {
    const call = await callApi(this.transport, 'POST', '/admin/error-reports/test');
    if (call.kind === 'offline') return 'offline';
    if (call.kind === 'refused' && call.response.status === 500) return 'server-error';
    return 'unexpected';
  }
}
