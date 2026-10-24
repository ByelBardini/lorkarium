import type { Page } from '@playwright/test';

// Runs in the page (the e2e workspace has no DOM types): decodes the PNG and averages each channel.
const MEAN_CHANNELS_OF_PNG = `(async () => {
  const image = new Image();
  image.src = 'data:image/png;base64,BASE64';
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const total = [0, 0, 0];
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) total[channel] += data[index + channel];
  }
  const pixels = data.length / 4;
  return { r: total[0] / pixels / 255, g: total[1] / pixels / 255, b: total[2] / pixels / 255 };
})()`;

export type Channels = Readonly<{ r: number; g: number; b: number }>;

/** The mean of each channel (0–1) of a `size` × `size` px square of the screen around `at`,
 *  decoded by the page itself (no PNG library in the e2e).
 *
 *  Example: `const { r, g } = await meanChannelsAt(bia, await cellCenterOf(bia, 5, 2), 4)` */
export async function meanChannelsAt(
  page: Page,
  at: Readonly<{ x: number; y: number }>,
  size = 8,
): Promise<Channels> {
  const clip = { x: at.x - size / 2, y: at.y - size / 2, width: size, height: size };
  const shot = await page.screenshot({ clip });
  return page.evaluate<Channels>(MEAN_CHANNELS_OF_PNG.replace('BASE64', shot.toString('base64')));
}
