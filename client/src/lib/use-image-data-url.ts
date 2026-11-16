import { useEffect, useState } from 'react';

/** A chosen image as a data URL, or `null` while it is read; a new `image` reads again.
 *
 *  Example: `const url = useImageDataUrl(file); return url && <img src={url} alt="" />` */
// Read as a data URL, not an object URL: the reader answers in a callback, and a revoked object
// URL would break the image when Strict Mode runs the effect twice.
export function useImageDataUrl(image: Blob): string | null {
  const [read, setRead] = useState<Readonly<{ image: Blob; url: string }> | null>(null);
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setRead({ image, url: reader.result });
    };
    reader.readAsDataURL(image);
    return () => reader.abort();
  }, [image]);
  return read?.image === image ? read.url : null;
}
