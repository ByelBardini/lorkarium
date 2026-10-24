import { describe, expect, it } from 'vitest';
import { avatarLinkRequestDto } from '../../src/account/avatar.dto';

describe('avatarLinkRequestDto', () => {
  it('trims an https link to a GIF', () => {
    expect(avatarLinkRequestDto.parse({ url: ' https://media.example.com/a.gif ' })).toEqual({
      url: 'https://media.example.com/a.gif',
    });
  });

  it.each([
    [{ url: 'ftp://x.com/a.gif' }],
    [{ url: 'data:image/gif;base64,AAAA' }],
    [{}],
    [{ url: 'https://x.com/a.gif', userId: 'x' }],
  ])('%o is refused', (body) => {
    expect(avatarLinkRequestDto.safeParse(body).success).toBe(false);
  });
});
