import type { AssetMimeTypeDto } from '@lorkarium/contracts';
import sharp, { type Metadata, type Sharp } from 'sharp';
import type {
  ImageProcessorPort,
  ImageRefusal,
  NormalizeOptions,
  NormalizeOutcome,
} from '../../modules/assets/image-processor.port';
import { framesWithin, frameHeightOf } from '../sharp-frames';
import { ALPHA_GRID_MAX_SIDE, outlineOfAlpha, type TracedOutline } from './alpha-outline';
import { keptAnimatedGif } from './animated-gif';
import { frameBoxOf, type ImageSize } from './frame-box';

// 100 megapixels: far above any map, far below a decompression bomb.
const DEFAULT_MAX_INPUT_PIXELS = 100_000_000;
const QUALITY = 90;
// The forum consensus for VTT maps: no visible loss against the PNG at a fraction of its weight.
const CONVERTED_WEBP_QUALITY = 85;
const EXPECTED = 'expected png, jpeg, webp or gif';

// SVG is left out on purpose: it decodes through a renderer that may carry script. GIF stays a GIF
// only with an animation budget (aura, sheet image); everywhere else it keeps its first frame as a
// PNG, so any image field takes one.
const STILL_FORMATS: Readonly<Record<string, AssetMimeTypeDto>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export type SharpImageProcessorOptions = Readonly<{ maxInputPixels?: number }>;

type Refused = Readonly<{ ok: false; refusal: ImageRefusal }>;
type StillInspected = Readonly<{ mimeType: AssetMimeTypeDto; size: ImageSize }>;
type Inspected =
  Readonly<{ ok: true; mimeType: AssetMimeTypeDto; size: ImageSize; frames: number }> | Refused;

/** `ImageProcessorPort` over `sharp`: reads the real format from the bytes, turns the image
 *  upright by its EXIF, cuts it to its `frame` (when given), shrinks it to `maxSide` and re-encodes it
 *  without any metadata. With an animation budget a GIF is kept animated; without, as a PNG of its
 *  first frame.
 *
 *  Example: `await new SharpImageProcessor().normalize(bytes, { maxSide: 256, frame: { aspect: { width: 1, height: 1 }, crop: null } })` */
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
    return image ? { ok: true, image } : notAnImage(bytes);
  }

  // No `animated`: sharp reads only the 1st frame (an animated WebP, APNG or a GIF with no budget
  // comes out still: only a GIF with a budget keeps its frames).
  private async still(bytes: Uint8Array, options: NormalizeOptions, inspected: StillInspected) {
    const mimeType = await this.keptMimeOf(bytes, options, inspected.mimeType);
    const resized = this.framedAndShrunk(bytes, options, inspected.size);
    const quality = mimeType === inspected.mimeType ? QUALITY : CONVERTED_WEBP_QUALITY;
    const output = await encoded(resized, mimeType, quality)
      .toBuffer({ resolveWithObject: true })
      .catch(() => null);
    if (!output) return null;
    const { data, info } = output;
    const outline = options.outline === true ? await outlineOfKept(data) : null;
    return {
      bytes: new Uint8Array(data),
      mimeType,
      width: info.width,
      height: info.height,
      outline,
    };
  }

  // sharp orders it `autoOrient` → `extract` → `resize`, so the frame is cut on the upright image
  // and the shrink never enlarges what was cut.
  private framedAndShrunk(bytes: Uint8Array, options: NormalizeOptions, size: ImageSize): Sharp {
    const upright = sharp(bytes, { limitInputPixels: this.maxInputPixels }).autoOrient();
    const { frame, maxSide } = options;
    const framed = frame ? upright.extract(frameBoxOf(size, frame.aspect, frame.crop)) : upright;
    return framed.resize({
      width: maxSide,
      height: maxSide,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // A transparent pixel keeps the sent format: only PNG and WebP carry alpha, and a JPEG has none.
  private async keptMimeOf(
    bytes: Uint8Array,
    options: NormalizeOptions,
    sent: AssetMimeTypeDto,
  ): Promise<AssetMimeTypeDto> {
    if (options.opaqueAsWebp !== true || sent === 'image/webp') return sent;
    if (sent === 'image/jpeg') return 'image/webp';
    const opaque = await this.isOpaque(bytes);
    return opaque ? 'image/webp' : sent;
  }

  // `isOpaque` reads the alpha channel; most editors export RGBA even for a map with no hole.
  private async isOpaque(bytes: Uint8Array): Promise<boolean> {
    const image = sharp(bytes, { limitInputPixels: this.maxInputPixels });
    const stats = await image.stats().catch(() => null);
    return stats?.isOpaque ?? false;
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
    if (!metadata) return notAnImage(bytes);
    if (metadata.format === 'gif' && options.animation) {
      return this.inspectGif(metadata, options.animation.maxFrames);
    }
    const mimeType = metadata.format === 'gif' ? 'image/png' : STILL_FORMATS[metadata.format];
    if (mimeType === undefined) {
      return refused('format', `format ${metadata.format} is not kept`, EXPECTED);
    }
    // A GIF's height counts all its frames; only the first is read.
    const size = uprightSizeOf(metadata);
    const pixels = size.width * size.height;
    if (pixels <= this.maxInputPixels) return { ok: true, mimeType, size, frames: 1 };
    const what = `the image has ${pixels} pixels, above the limit of ${this.maxInputPixels}`;
    return refused('too-many-pixels', what, EXPECTED);
  }

  private inspectGif(metadata: Metadata, maxFrames: number): Inspected {
    const counted = framesWithin(metadata, { maxFrames, maxPixels: this.maxInputPixels }, 'image');
    if (!counted.ok) {
      const { reason, what, expected } = counted.refusal;
      return refused(reason, what, expected);
    }
    return {
      ok: true,
      mimeType: 'image/gif',
      size: uprightSizeOf(metadata),
      frames: counted.frames,
    };
  }
}

// The header gives the size before `autoOrient`; EXIF orientations 5 to 8 turn the image a
// quarter, so the frame is cut on the swapped sides.
function uprightSizeOf(metadata: Metadata): ImageSize {
  const width = metadata.width;
  const height = frameHeightOf(metadata);
  const quarterTurned = (metadata.orientation ?? 1) >= 5;
  return quarterTurned ? { width: height, height: width } : { width, height };
}

// Read from the kept file, not the sent one: a crop or a rotation is already in it. An image with
// no alpha gets a full one, so it comes out as its own rectangle.
async function outlineOfKept(kept: Buffer): Promise<TracedOutline> {
  const side = ALPHA_GRID_MAX_SIDE;
  const { data, info } = await sharp(kept)
    .ensureAlpha()
    .extractChannel('alpha')
    .resize({
      width: side,
      height: side,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'linear',
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return outlineOfAlpha({ width: info.width, height: info.height, alpha: new Uint8Array(data) });
}

function notAnImage(bytes: Uint8Array): Refused {
  const what = `the ${bytes.byteLength} bytes do not decode as an image`;
  return refused('not-an-image', what, EXPECTED);
}

function refused(reason: ImageRefusal['reason'], what: string, expected: string): Refused {
  return { ok: false, refusal: { reason, detail: `${what}; ${expected}` } };
}

function encoded(image: Sharp, mimeType: AssetMimeTypeDto, quality: number): Sharp {
  if (mimeType === 'image/png') return image.png();
  if (mimeType === 'image/jpeg') return image.jpeg({ quality });
  return image.webp({ quality });
}
