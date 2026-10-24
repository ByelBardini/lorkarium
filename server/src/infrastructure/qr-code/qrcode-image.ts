import QRCode from 'qrcode';
import type { QrCodePort } from '../../modules/account-security/qr-code.port';

// Big enough for a phone camera across a desk; the margin is the quiet zone readers need.
const SIDE_PX = 240;
const MARGIN_MODULES = 2;

/** QR as a PNG data URL over `qrcode`, error correction M (survives a smudged screen).
 *
 *  Example: `await new QrCodeImage().pngDataUrl(otpauthUri)` */
export class QrCodeImage implements QrCodePort {
  async pngDataUrl(text: string): Promise<string> {
    return QRCode.toDataURL(text, {
      type: 'image/png',
      errorCorrectionLevel: 'M',
      width: SIDE_PX,
      margin: MARGIN_MODULES,
    });
  }
}
