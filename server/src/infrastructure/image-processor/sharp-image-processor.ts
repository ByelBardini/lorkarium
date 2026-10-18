import type { AssetMimeTypeDto } from '@lorkarium/contracts';
import sharp, { type Sharp } from 'sharp';
import type {
  ImageProcessorPort,
  ImageRefusal,
  NormalizeOutcome,
} from '../../modules/assets/image-processor.port';

// 100 megapixels: far above any map, far below a decompression bomb.
const DEFAULT_MAX_INPUT_PIXELS = 100_000_000;
const QUALITY = 90;
const EXPECTED = 'expected png, jpeg or webp';

// GIF and SVG are left out on purpose: SVG decodes through a renderer that may carry script.
const KEPT_FORMATS: Readonly<Record<string, AssetMimeTypeDto>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export type SharpImageProcessorOptions = Readonly<{ maxInputPixels?: number }>;

type Refused = Readonly<{ ok: false; refusal: ImageRefusal }>;
type Inspected = Readonly<{ ok: true; mimeType: AssetMimeTypeDto }> | Refused;

/** `ImageProcessorPort` over `sharp`: reads the real format from the bytes, turns the image
 *  upright by its EXIF, shrinks it to `maxSide` and re-encodes it without any metadata.
 *
 *  Example: `await new SharpImageProcessor().normalize(bytes, { maxSide: 1024 })` */
export class SharpImageProcessor implements ImageProcessorPort {
  private readonly maxInputPixels: number;

  constructor(options: SharpImageProcessorOptions = {}) {
    this.maxInputPixels = options.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS;
  }

  async normalize(
    bytes: Uint8Array,
    options: Readonly<{ maxSide: number }>,
  ): Promise<NormalizeOutcome> {
    const inspected = await this.inspect(bytes);
    if (!inspected.ok) return inspected;
    const { mimeType } = inspected;
    const resized = sharp(bytes, { limitInputPixels: this.maxInputPixels }).autoOrient().resize({
      width: options.maxSide,
      height: options.maxSide,
      fit: 'inside',
      withoutEnlargement: true,
    });
    const output = await encoded(resized, mimeType)
      .toBuffer({ resolveWithObject: true })
      .catch(() => null);
    if (!output) return notAnImage(bytes);
    const { data, info } = output;
    const image = { bytes: new Uint8Array(data), mimeType, width: info.width, height: info.height };
    return { ok: true, image };
  }

  private async inspect(bytes: Uint8Array): Promise<Inspected> {
    const metadata = await sharp(bytes, { limitInputPixels: false })
      .metadata()
      .catch(() => null);
    if (!metadata) return notAnImage(bytes);
    const mimeType = KEPT_FORMATS[metadata.format];
    if (mimeType === undefined) return refused('format', `format ${metadata.format} is not kept`);
    const pixels = metadata.width * metadata.height;
    if (pixels <= this.maxInputPixels) return { ok: true, mimeType };
    return refused(
      'too-many-pixels',
      `the image has ${pixels} pixels, above the limit of ${this.maxInputPixels}`,
    );
  }
}

function notAnImage(bytes: Uint8Array): Refused {
  return refused('not-an-image', `the ${bytes.byteLength} bytes do not decode as an image`);
}

function refused(reason: ImageRefusal['reason'], what: string): Refused {
  return { ok: false, refusal: { reason, detail: `${what}; ${EXPECTED}` } };
}

function encoded(image: Sharp, mimeType: AssetMimeTypeDto): Sharp {
  if (mimeType === 'image/png') return image.png();
  if (mimeType === 'image/jpeg') return image.jpeg({ quality: QUALITY });
  return image.webp({ quality: QUALITY });
}
