import { describe, expect, it } from 'vitest';
import { decideAccess } from '@/app/route-access';
import { ANA, ROOT_ADMIN } from '../support/auth-api-fake';

const anonymous = { status: 'anonymous' } as const;
const asUser = { status: 'authenticated', user: ANA } as const;
const asAdmin = { status: 'authenticated', user: ROOT_ADMIN } as const;

function at(pathAndSearch: string): URL {
  return new URL(pathAndSearch, 'http://localhost');
}

describe('decideAccess', () => {
  it.each([
    ['an anonymous visitor', anonymous],
    ['a signed-in account', asUser],
  ] as const)('%s on an "anyone" route (the e-mail link) passes', (_, session) => {
    expect(decideAccess(session, 'anyone', at('/account/email/confirm'))).toEqual({
      kind: 'allow',
    });
  });

  it('an anonymous visitor on a signed-in route goes to the login with next=/', () => {
    expect(decideAccess(anonymous, 'signed-in', at('/'))).toEqual({
      kind: 'redirect',
      to: '/login?next=%2F',
    });
  });

  it('an anonymous visitor keeps the full path and query in next', () => {
    expect(decideAccess(anonymous, 'admin', at('/admin?tab=users'))).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fadmin%3Ftab%3Dusers',
    });
  });

  it('an anonymous visitor may open the login', () => {
    expect(decideAccess(anonymous, 'public-only', at('/login'))).toEqual({ kind: 'allow' });
  });

  it('a signed-in account on the login goes home', () => {
    expect(decideAccess(asUser, 'public-only', at('/login'))).toEqual({
      kind: 'redirect',
      to: '/',
    });
  });

  it('a signed-in account on the login with a safe next goes to that next', () => {
    expect(decideAccess(asAdmin, 'public-only', at('/login?next=%2Fadmin'))).toEqual({
      kind: 'redirect',
      to: '/admin',
    });
  });

  it('a user on the admin route goes home', () => {
    expect(decideAccess(asUser, 'admin', at('/admin'))).toEqual({ kind: 'redirect', to: '/' });
  });

  it('an admin on the admin route passes', () => {
    expect(decideAccess(asAdmin, 'admin', at('/admin'))).toEqual({ kind: 'allow' });
  });

  it('a user on a signed-in route passes', () => {
    expect(decideAccess(asUser, 'signed-in', at('/'))).toEqual({ kind: 'allow' });
  });
});
