import { REALTIME_PATH } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { realtimeClientOptions } from '@/services/realtime-transport';

describe('realtimeClientOptions', () => {
  it('goes to the websocket first and falls back to polling when it fails, same origin with the cookie', () => {
    expect(realtimeClientOptions()).toEqual({
      path: REALTIME_PATH,
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
    });
  });
});
