import { AVATAR_SIDE } from '@lorkarium/contracts';
import sharp, { type Sharp } from 'sharp';
import type {
  AvatarOutcome,
  AvatarProcessorPort,
  AvatarRefusal,
  ImageShape,
} from '../../modules/profiles/avatar-processor.port';
import { framesWithin } from '../sharp-frames';

// An animated photo decodes every frame: the budget is pixels × frames, not one frame.
const DEFAULT_MAX_TOTAL_PIXELS = 100_000_000;
const DEFAULT_MAX_FRAMES = 120;
const QUALITY = 85;
const EXPECTED = 'expected png, jpeg, webp or gif';
// SVG is left out on purpose: it decodes through a renderer that may carry script.
const KEPT_FORMATS: ReadonlySet<string> = new Set(['png', 'jpeg', 'webp', 'gif']);
const PHOTO_SHAPE: ImageShape = { side: AVATAR_SIDE, animated: true };

export type SharpAvatarProcessorOptions = Readonly<{
  maxTotalPixels?: number;
  maxFrames?: number;
}>;

type Refused = Readonly<{ ok: false; refusal: AvatarRefusal }>;
type Inspected = Readonly<{ ok: true; frames: number }> | Refused;

/** `AvatarProcessorPort` over `sharp`: reads the real format from the bytes, refuses a bomb before
 *  decoding it, cuts the center into the square of `shape` (the photo's 256 by default) and
 *  re-encodes it as WebP (animated when the input is and the shape allows) without any metadata.
 *
 *  Example: `await new SharpAvatarProcessor().normalize(bytes, { side: 512, animated: false })` */
export class SharpAvatarProcessor implements AvatarProcessorPort {
  private readonly maxTotalPixels: number;
  private readonly maxFrames: number;

  constructor(options: SharpAvatarProcessorOptions = {}) {
    this.maxTotalPixels = options.maxTotalPixels ?? DEFAULT_MAX_TOTAL_PIXELS;
    this.maxFrames = options.maxFrames ?? DEFAULT_MAX_FRAMES;
  }

  async normalize(bytes: Uint8Array, shape: ImageShape = PHOTO_SHAPE): Promise<AvatarOutcome> {
    const inspected = await this.inspect(bytes);
    if (!inspected.ok) return inspected;
    const frames = shape.animated ? inspected.frames : 1;
    const output = await squared(bytes, frames, shape.side, this.maxTotalPixels)
      .webp({ quality: QUALITY })
      .toBuffer()
      .catch(() => null);
    if (!output) return notAnImage(bytes);
    return { ok: true, avatar: { bytes: new Uint8Array(output), frames } };
  }

  private async inspect(bytes: Uint8Array): Promise<Inspected> {
    const metadata = await sharp(bytes, { limitInputPixels: false })
      .metadata()
      .catch(() => null);
    if (!metadata) return notAnImage(bytes);
    if (!KEPT_FORMATS.has(metadata.format)) {
      return refused('format', `format ${metadata.format} is not kept`);
    }
    const limits = { maxFrames: this.maxFrames, maxPixels: this.maxTotalPixels };
    const counted = framesWithin(metadata, limits, 'photo');
    if (counted.ok) return counted;
    const { reason, what, expected } = counted.refusal;
    return refused(reason, what, expected);
  }
}

// One frame is turned upright by its EXIF first; an animation has no orientation to honor.
// Without `animated`, sharp decodes only the first frame: that is how a still shape drops the rest.
function squared(bytes: Uint8Array, frames: number, side: number, maxTotalPixels: number): Sharp {
  const animated = frames > 1;
  const image = sharp(bytes, { animated, limitInputPixels: maxTotalPixels });
  const upright = animated ? image : image.autoOrient();
  return upright.resize(side, side, { fit: 'cover', position: 'centre' });
}

function notAnImage(bytes: Uint8Array): Refused {
  return refused('not-an-image', `the ${bytes.byteLength} bytes do not decode as an image`);
}

function refused(reason: AvatarRefusal['reason'], what: string, expected = EXPECTED): Refused {
  return { ok: false, refusal: { reason, detail: `${what}; ${expected}` } };
}
