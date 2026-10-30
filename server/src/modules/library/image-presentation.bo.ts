export type PresentedImage = Readonly<{ id: string; name: string }>;
export type NewImagePresentation = Readonly<{
  presentationId: string;
  imageId: string;
  nameAtPresentation: string;
}>;
export function newImagePresentation(
  image: PresentedImage,
  presentationId: string,
): NewImagePresentation {
  return { presentationId, imageId: image.id, nameAtPresentation: image.name };
}
