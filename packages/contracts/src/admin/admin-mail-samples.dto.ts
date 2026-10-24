import { z } from 'zod';

/** One system e-mail the backoffice can send as a test: its id, its name and its subject. */
export const mailSampleDto = z.strictObject({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
});

export type MailSampleDto = z.infer<typeof mailSampleDto>;

/** Response of `GET /api/admin/mail-samples`, in the catalog order. */
export const mailSamplesResponseDto = z.strictObject({ samples: z.array(mailSampleDto) });

export type MailSamplesResponseDto = z.infer<typeof mailSamplesResponseDto>;

/** Params of `POST /api/admin/mail-samples/:sampleId/send`. */
export const mailSampleParamsDto = z.strictObject({ sampleId: z.string().min(1).max(40) });

/** Body of `POST /api/admin/mail-samples/:sampleId/send`: the inbox that gets the sample.
 *
 *  Example: `sendMailSampleRequestDto.parse({ to: ' Eu@X.com ' }).to // 'eu@x.com'` */
export const sendMailSampleRequestDto = z.strictObject({
  to: z.string().trim().toLowerCase().pipe(z.email()),
});

export type SendMailSampleRequestDto = z.infer<typeof sendMailSampleRequestDto>;

/** Response of a sent sample: which subject went to which address. */
export const sendMailSampleResponseDto = z.strictObject({ subject: z.string(), to: z.email() });

export type SendMailSampleResponseDto = z.infer<typeof sendMailSampleResponseDto>;
