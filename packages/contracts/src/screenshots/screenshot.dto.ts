import { z } from 'zod';

/** A report or a feedback carries a few screenshots without turning into a file store. */
export const SCREENSHOTS_MAX = 5;
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
/** The types a screenshot upload accepts (the `Content-Type` of the raw body). */
export const SCREENSHOT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** The ids of up to 5 screenshots sent first, each once.
 *
 *  Example: `screenshotIdsDto.parse([shotA, shotA]) // throws: listed twice` */
export const screenshotIdsDto = z
  .array(z.uuid())
  .max(SCREENSHOTS_MAX, {
    error: (issue) =>
      `${String((issue.input as unknown[]).length)} attachments: expected at most ${SCREENSHOTS_MAX}`,
  })
  .superRefine((ids, context) => {
    const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
    if (repeated === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `attachment ${repeated} is listed twice: expected each id once`,
    });
  });

/** A screenshot as it was kept (normalized, without metadata): what the backoffice lays out. */
export const screenshotDto = z.strictObject({
  id: z.uuid(),
  mimeType: z.enum(SCREENSHOT_MIME_TYPES),
  width: z.int().positive(),
  height: z.int().positive(),
  sizeBytes: z.int().positive(),
});
export type ScreenshotDto = z.infer<typeof screenshotDto>;

/** Response of a screenshot upload: the id the report or feedback then cites. */
export const screenshotResponseDto = z.strictObject({ attachment: screenshotDto });
export type ScreenshotResponseDto = z.infer<typeof screenshotResponseDto>;
