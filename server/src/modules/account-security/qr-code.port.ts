/** Draws text as a QR code.
 *
 *  Example: `await qr.pngDataUrl('otpauth://totp/…') // 'data:image/png;base64,…'` */
export interface QrCodePort {
  pngDataUrl(text: string): Promise<string>;
}
