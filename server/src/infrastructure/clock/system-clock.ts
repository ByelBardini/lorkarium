import type { ClockPort } from '../../modules/auth/clock.port';

/** The real clock; tests inject a fake `ClockPort` instead.
 *
 *  Example: `new SystemClock().now()` */
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
