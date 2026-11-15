import { describe, expect, it } from 'vitest';
import { bannerUploadQueryDto } from '../../src/account/banner.dto';

describe('bannerUploadQueryDto', () => {
  it('no rectangle is the centre crop', () => {
    expect(bannerUploadQueryDto.parse({})).toEqual({});
  });

  it('the four fields of the query string become numbers in percent', () => {
    const query = { cropX: '0', cropY: '10.5', cropW: '100', cropH: '60' };

    expect(bannerUploadQueryDto.parse(query)).toEqual({
      cropX: 0,
      cropY: 10.5,
      cropW: 100,
      cropH: 60,
    });
  });

  it('a rectangle with only some fields is refused, naming the ones received', () => {
    const parsed = bannerUploadQueryDto.safeParse({ cropX: '1', cropW: '2' });

    expect(parsed.error?.issues[0]?.message).toMatch(/only cropX, cropW/);
  });

  it('a rectangle that leaves the image is refused', () => {
    const query = { cropX: '60', cropY: '0', cropW: '50', cropH: '100' };

    expect(bannerUploadQueryDto.safeParse(query).success).toBe(false);
  });

  it('a purpose or any other key is refused: the banner has no purpose', () => {
    expect(bannerUploadQueryDto.safeParse({ purpose: 'cover' }).success).toBe(false);
  });
});
