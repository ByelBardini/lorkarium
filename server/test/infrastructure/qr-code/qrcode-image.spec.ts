import { describe, expect, it } from 'vitest';
import { QrCodeImage } from '../../../src/infrastructure/qr-code/qrcode-image';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('QrCodeImage', () => {
  it('draws the text as a PNG data URL', async () => {
    const url = await new QrCodeImage().pngDataUrl('otpauth://totp/Lorkarium:ana?secret=ABC');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    const bytes = Buffer.from(url.slice('data:image/png;base64,'.length), 'base64');
    expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it('different texts give different images', async () => {
    const qr = new QrCodeImage();
    expect(await qr.pngDataUrl('otpauth://a')).not.toBe(await qr.pngDataUrl('otpauth://b'));
  });
});
