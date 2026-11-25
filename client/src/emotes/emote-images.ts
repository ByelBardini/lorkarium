// Smileys: Noto Emoji (Google, Apache 2.0). Memes: from the Firecast pack and the Discord CDN (no
// license, the user took the risk) and drawn for the project (src/emotes/drawn/). Each file is
// 96 px, enough for the 40 px sticker size at 2x.
const IMAGE_URLS = import.meta.glob<string>('./images/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** The URL of a custom emoji's picture, served by id (it follows the owner's plan).
 *
 *  Example: `customEmojiImageUrlOf(emojiId) // '/api/custom-emojis/<id>'` */
export function customEmojiImageUrlOf(emojiId: string): string {
  return `/api/custom-emojis/${emojiId}`;
}

/** The URL (hashed by Vite, cached for good) of an emote's picture.
 *
 *  Example: `emoteImageUrlOf('doge') // '/assets/doge-3f2a1c.png'` */
export function emoteImageUrlOf(id: string): string {
  const url = IMAGE_URLS[`./images/${id}.png`];
  if (url === undefined) {
    throw new Error(`No emote image "${id}": expected a file src/emotes/images/${id}.png`);
  }
  return url;
}
