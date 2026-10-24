import {
  REALTIME_COMPRESSION_THRESHOLD_BYTES,
  REALTIME_MESSAGE_MAX_BYTES,
  REALTIME_PATH,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { realtimeServerOptions } from '../../src/realtime/realtime-server';

describe('realtimeServerOptions', () => {
  it('compresses messages from 4 KB on and takes the largest valid command in the buffer', () => {
    expect(realtimeServerOptions()).toEqual({
      path: REALTIME_PATH,
      serveClient: false,
      perMessageDeflate: { threshold: REALTIME_COMPRESSION_THRESHOLD_BYTES },
      maxHttpBufferSize: REALTIME_MESSAGE_MAX_BYTES,
    });
    expect(REALTIME_COMPRESSION_THRESHOLD_BYTES).toBe(4096);
  });
});
