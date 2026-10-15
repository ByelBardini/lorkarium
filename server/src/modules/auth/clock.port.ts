/** The current instant, injected so expiry rules are testable without waiting. */
export interface ClockPort {
  now(): Date;
}
