import { describe, expect, it } from 'vitest';
import { ApiLoadError } from '@/app/shell/api-loader';
import { isReportableClientError } from '@/lib/reportable-client-error';
import { NetworkUnavailableError } from '@/services/http-transport';

describe('isReportableClientError', () => {
  it.each([
    ['an ApiLoadError (unexpected)', new ApiLoadError('unexpected')],
    ['an ApiLoadError (offline)', new ApiLoadError('offline')],
    ['an offline request', new NetworkUnavailableError('/campaigns', new TypeError('x'))],
    ['a route response', { status: 404, statusText: 'Not Found', internal: true, data: '' }],
    ['an aborted request', new DOMException('The user aborted a request.', 'AbortError')],
    ['Chrome offline', new TypeError('Failed to fetch')],
    ['Safari offline', new TypeError('Load failed')],
    ['Firefox offline', new TypeError('NetworkError when attempting to fetch resource.')],
    ['a stale chunk (Chrome)', new TypeError('Failed to fetch dynamically imported module: /a.js')],
    ['a stale chunk (Safari)', new TypeError('Importing a module script failed.')],
    ['the ResizeObserver quirk', 'ResizeObserver loop completed with undelivered notifications.'],
  ])('%s is not reported', (_case, error) => {
    expect(isReportableClientError(error)).toBe(false);
  });

  it.each([
    ['a code TypeError', new TypeError('x is undefined')],
    ['a plain Error', new Error('the token has no scene')],
    ['a thrown string', 'algo deu errado'],
    ['any object', { reason: 'weird' }],
  ])('%s is reported', (_case, error) => {
    expect(isReportableClientError(error)).toBe(true);
  });
});
