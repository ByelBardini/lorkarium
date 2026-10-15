import { describe, expect, it } from 'vitest';
import { isSameOrigin } from '../../src/realtime/same-origin';

describe('isSameOrigin', () => {
  it('an Origin whose host equals the Host header is accepted', () => {
    expect(isSameOrigin('http://localhost:5173', 'localhost:5173')).toBe(true);
  });

  it('an Origin from another host is refused', () => {
    expect(isSameOrigin('https://evil.example', 'localhost:5173')).toBe(false);
  });

  it('the same host on another port is refused', () => {
    expect(isSameOrigin('http://localhost:6666', 'localhost:5173')).toBe(false);
  });

  it('a request without Origin (not a browser) is accepted; the cookie is still required', () => {
    expect(isSameOrigin(undefined, 'localhost:5173')).toBe(true);
  });

  it.each(['null', 'not a url'])('the Origin %s is refused', (origin) => {
    expect(isSameOrigin(origin, 'localhost:5173')).toBe(false);
  });

  it('an Origin without a Host header to compare with is refused', () => {
    expect(isSameOrigin('http://localhost:5173', undefined)).toBe(false);
  });
});
