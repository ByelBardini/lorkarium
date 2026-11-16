import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useImageDataUrl } from '@/lib/use-image-data-url';

describe('useImageDataUrl', () => {
  it('yields null while reading, then the data URL of the image', async () => {
    const image = new Blob(['png'], { type: 'image/png' });
    const { result } = renderHook(() => useImageDataUrl(image));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('data:image/png;base64,cG5n'));
  });

  it('a new image never shows the previous one while it is read', async () => {
    const first = new Blob(['png'], { type: 'image/png' });
    const { result, rerender } = renderHook(({ image }) => useImageDataUrl(image), {
      initialProps: { image: first },
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ image: new Blob(['gif'], { type: 'image/gif' }) });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('data:image/gif;base64,Z2lm'));
  });
});
