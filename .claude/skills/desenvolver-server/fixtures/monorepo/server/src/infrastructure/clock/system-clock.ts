import type { ClockPort } from '../../modules/campaigns/clock.port';

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
