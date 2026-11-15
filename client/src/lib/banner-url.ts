/** Where the profile banner is read: `GET /api/banners/:bannerId` (session required).
 *
 *  Example: `bannerUrlOf(profile.bannerId) // '/api/banners/9c8b…'` */
export function bannerUrlOf(bannerId: string): string {
  return `/api/banners/${bannerId}`;
}
