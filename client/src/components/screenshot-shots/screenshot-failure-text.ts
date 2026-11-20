import type { ScreenshotUploadFailure } from '@/services/account-failure';

const SHOT_FAILURE_TEXT: Partial<Record<ScreenshotUploadFailure['kind'], string>> = {
  attachment_too_large: 'O print passa de 5 MB.',
  unsupported_image: 'Esse arquivo não é um PNG, JPEG ou WebP.',
  offline: 'Sem conexão. Tente de novo.',
  unauthenticated: 'Sua sessão terminou. Entre de novo.',
};

/** Why one screenshot did not go up (pt-BR), shown on that screenshot.
 *
 *  Example: `screenshotFailureText({ kind: 'unsupported_image' }) // 'Esse arquivo não é um PNG, JPEG ou WebP.'` */
export function screenshotFailureText(failure: ScreenshotUploadFailure): string {
  if (failure.kind === 'rate_limited') {
    return `Muitos prints seguidos. Tente de novo em ${failure.retryAfterSeconds} s.`;
  }
  return SHOT_FAILURE_TEXT[failure.kind] ?? 'O print não subiu. Tente de novo.';
}
