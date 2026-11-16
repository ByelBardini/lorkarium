/** Where a badge image is read: `GET /api/badge-images/:imageId` (session required; a new image
 *  gets a new id, so the immutable cache never serves the old one).
 *
 *  Example: `badgeImageUrlOf(badge.imageId) // '/api/badge-images/9c8b…'` */
export function badgeImageUrlOf(imageId: string): string {
  return `/api/badge-images/${imageId}`;
}
