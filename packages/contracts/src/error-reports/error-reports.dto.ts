import { z } from 'zod';

/** Response of `GET /api/error-reports/settings`: where the browser SDK reports (through the
 *  server's tunnel), or `dsn: null` when the server runs without Sentry (the client loads no SDK).
 *
 *  Example: `errorReportingSettingsDto.parse(body).dsn // 'https://abc@o1.ingest.de.sentry.io/123'` */
export const errorReportingSettingsDto = z.strictObject({
  dsn: z.string().min(1).nullable(),
  environment: z.string().min(1),
  release: z.string().min(1).nullable(),
});

export type ErrorReportingSettingsDto = z.infer<typeof errorReportingSettingsDto>;

/** The first line of a Sentry envelope; loose, since the SDK adds `sdk`, `sent_at`, `trace`.
 *
 *  Example: `errorReportEnvelopeHeaderDto.parse({ dsn, event_id: '…' }).dsn` */
export const errorReportEnvelopeHeaderDto = z.looseObject({
  dsn: z.string().optional(),
});

export type ErrorReportEnvelopeHeaderDto = z.infer<typeof errorReportEnvelopeHeaderDto>;

/** The header line of one envelope item: its type and, optionally, the payload length in bytes.
 *
 *  Example: `errorReportItemHeaderDto.parse({ type: 'event', length: 42 }).type // 'event'` */
export const errorReportItemHeaderDto = z.looseObject({
  type: z.string().min(1),
  length: z.int().nonnegative().optional(),
});

export type ErrorReportItemHeaderDto = z.infer<typeof errorReportItemHeaderDto>;

const breadcrumbDto = z.looseObject({ data: z.record(z.string(), z.unknown()).optional() });

/** The fields of a browser event the tunnel rewrites; everything else passes as it came.
 *
 *  Example: `errorReportEventDto.parse(JSON.parse(payload)).request?.url` */
export const errorReportEventDto = z.looseObject({
  user: z.unknown().optional(),
  request: z.looseObject({ url: z.string().optional() }).optional(),
  breadcrumbs: z.looseObject({ values: z.array(breadcrumbDto).optional() }).optional(),
});

export type ErrorReportEventDto = z.infer<typeof errorReportEventDto>;
