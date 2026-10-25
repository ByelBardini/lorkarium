import type { AssetMimeTypeDto } from '@lorkarium/contracts';
import sharp, { type Metadata, type ResizeOptions, type Sharp } from 'sharp';
import type {
  ImageProcessorPort,
  ImageRefusal,
  NormalizeOptions,
  NormalizeOutcome,
} from '../../modules/assets/image-processor.port';
import { framesWithin, frameHeightOf } from '../sharp-frames';
import { keptAnimatedGif } from './animated-gif';

// 100 megapixels: far above any map, far below a decompression bomb.
const DEFAULT_MAX_INPUT_PIXELS = 100_000_000;
const QUALITY = 90;
const EXPECTED = 'expected png, jpeg or webp';
const EXPECTED_ANIMATED = 'expected png, jpeg, webp or gif';

// SVG is left out on purpose: it decodes through a renderer that may carry script. GIF is kept
// only with an animation budget (the aura); everywhere else a moving image is refused.
const STILL_FORMATS: Readonly<Record<string, AssetMimeTypeDto>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export type SharpImageProcessorOptions = Readonly<{ maxInputPixels?: number }>;

type Refused = Readonly<{ ok: false; refusal: ImageRefusal }>;
type StillInspected = Readonly<{ mimeType: AssetMimeTypeDto; shortSide: number }>;
type Inspected =
  Readonly<{ ok: true; mimeType: AssetMimeTypeDto; shortSide: number; frames: number }> | Refused;

/** `ImageProcessorPort` over `sharp`: reads the real format from the bytes, turns the image
 *  upright by its EXIF, shrinks it to `maxSide` (or cuts its centre square) and re-encodes it
 *  without any metadata. With an animation budget a GIF is let in and kept animated.
 *
 *  Example: `await new SharpImageProcessor().normalize(bytes, { maxSide: 256, square: true })` */
export class SharpImageProcessor implements ImageProcessorPort {
  private readonly maxInputPixels: number;

  constructor(options: SharpImageProcessorOptions = {}) {
    this.maxInputPixels = options.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS;
  }

  async normalize(bytes: Uint8Array, options: NormalizeOptions): Promise<NormalizeOutcome> {
    const inspected = await this.inspect(bytes, options);
    if (!inspected.ok) return inspected;
    const image =
      inspected.mimeType === 'image/gif'
        ? await this.animated(bytes, inspected.frames, options)
        : await this.still(bytes, options, inspected);
    return image ? { ok: true, image } : notAnImage(bytes, options);
  }

  // No `animated`: sharp reads only the 1st frame, since only an aura moves (an animated WebP or
  // APNG comes out still: just the GIF keeps its frames).
  private async still(bytes: Uint8Array, options: NormalizeOptions, inspected: StillInspected) {
    const { mimeType } = inspected;
    const resized = sharp(bytes, { limitInputPixels: this.maxInputPixels })
      .autoOrient()
      .resize(resizeOf(options, inspected.shortSide));
    const output = await encoded(resized, mimeType)
      .toBuffer({ resolveWithObject: true })
      .catch(() => null);
    if (!output) return null;
    const { data, info } = output;
    return { bytes: new Uint8Array(data), mimeType, width: info.width, height: info.height };
  }

  private async animated(bytes: Uint8Array, frames: number, options: NormalizeOptions) {
    const { animation } = options;
    if (!animation) return null;
    const target = { maxSide: options.maxSide, animation, maxInputPixels: this.maxInputPixels };
    return keptAnimatedGif(bytes, frames, target);
  }

  private async inspect(bytes: Uint8Array, options: NormalizeOptions): Promise<Inspected> {
    const metadata = await sharp(bytes, { limitInputPixels: false })
      .metadata()
      .catch(() => null);
    if (!metadata) return notAnImage(bytes, options);
    if (metadata.format === 'gif' && options.animation) {
      return this.inspectGif(metadata, options.animation.maxFrames);
    }
    const mimeType = STILL_FORMATS[metadata.format];
    if (mimeType === undefined) {
      return refused('format', `format ${metadata.format} is not kept`, expectedOf(options));
    }
    const pixels = metadata.width * metadata.height;
    const shortSide = Math.min(metadata.width, metadata.height);
    if (pixels <= this.maxInputPixels) return { ok: true, mimeType, shortSide, frames: 1 };
    const what = `the image has ${pixels} pixels, above the limit of ${this.maxInputPixels}`;
    return refused('too-many-pixels', what, expectedOf(options));
  }

  private inspectGif(metadata: Metadata, maxFrames: number): Inspected {
    const counted = framesWithin(metadata, { maxFrames, maxPixels: this.maxInputPixels }, 'image');
    if (!counted.ok) {
      const { reason, what, expected } = counted.refusal;
      return refused(reason, what, expected);
    }
    const shortSide = Math.min(metadata.width, frameHeightOf(metadata));
    return { ok: true, mimeType: 'image/gif', shortSide, frames: counted.frames };
  }
}

// The square side never enlarges: the shortest side of the image, at most `maxSide`. The
// rotation of `autoOrient` swaps width and height, so the shortest side stays the same.
function resizeOf(options: NormalizeOptions, shortSide: number): ResizeOptions {
  const { maxSide } = options;
  if (options.square !== true) {
    return { width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true };
  }
  const side = Math.min(shortSide, maxSide);
  return { width: side, height: side, fit: 'cover', position: 'centre' };
}

function expectedOf(options: NormalizeOptions): string {
  return options.animation ? EXPECTED_ANIMATED : EXPECTED;
}

function notAnImage(bytes: Uint8Array, options: NormalizeOptions): Refused {
  const what = `the ${bytes.byteLength} bytes do not decode as an image`;
  return refused('not-an-image', what, expectedOf(options));
}

function refused(reason: ImageRefusal['reason'], what: string, expected: string): Refused {
  return { ok: false, refusal: { reason, detail: `${what}; ${expected}` } };
}

function encoded(image: Sharp, mimeType: AssetMimeTypeDto): Sharp {
  if (mimeType === 'image/png') return image.png();
  if (mimeType === 'image/jpeg') return image.jpeg({ quality: QUALITY });
  return image.webp({ quality: QUALITY });
}
