import { expect, it } from 'vitest';
import { newImagePresentation } from '../../../src/modules/library/image-presentation.bo';
it('captures the name at presentation while a new click has its own identity', () => {
  const image = { id: 'image', name: 'Antes' };
  const first = newImagePresentation(image, 'p1');
  image.name = 'Depois';
  const second = newImagePresentation(image, 'p2');
  expect(first).toEqual({ presentationId: 'p1', imageId: 'image', nameAtPresentation: 'Antes' });
  expect(second).toEqual({ presentationId: 'p2', imageId: 'image', nameAtPresentation: 'Depois' });
});
