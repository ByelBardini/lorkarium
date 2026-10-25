import { describe, expect, it } from 'vitest';
import { readShellEvent } from '../src/shell-events';

describe('readShellEvent', () => {
  it('turns a valid download payload into the event', () => {
    const reading = readShellEvent({ kind: 'downloading', downloaded: 10, total: 50 });

    expect(reading).toEqual({
      event: { kind: 'downloading', downloaded: 10, total: 50 },
      problem: null,
    });
  });

  it('accepts a download without a known total (no Content-Length)', () => {
    const reading = readShellEvent({ kind: 'downloading', downloaded: 10, total: null });

    expect(reading.event).toEqual({ kind: 'downloading', downloaded: 10, total: null });
  });

  it('turns a payload-free kind into the event', () => {
    expect(readShellEvent({ kind: 'offline' }).event).toEqual({ kind: 'offline' });
  });

  it('refuses a negative download citing the value', () => {
    const reading = readShellEvent({ kind: 'downloading', downloaded: -1, total: 50 });

    expect(reading.event).toBeNull();
    expect(reading.problem).toContain('-1');
  });

  it('refuses a kind outside the list citing the kind', () => {
    const reading = readShellEvent({ kind: 'rebooting' });

    expect(reading.event).toBeNull();
    expect(reading.problem).toContain('rebooting');
  });

  it('refuses a payload that is not an object citing it', () => {
    const reading = readShellEvent('offline');

    expect(reading.event).toBeNull();
    expect(reading.problem).toContain('"offline"');
  });
});
