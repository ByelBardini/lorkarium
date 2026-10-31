import { describe, expect, it } from 'vitest';
import { documentContentFromEditor } from '@/rich-text-editor/document-content-adapter';

describe('documentContentFromEditor', () => {
  it('removes editor defaults and arbitrary HTML attributes before persistence', () => {
    expect(
      documentContentFromEditor({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { textAlign: null, indent: 0, lineHeight: 1.5, onclick: 'alert(1)' },
            content: [{ type: 'text', text: 'Carta' }],
          },
        ],
      }),
    ).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { indent: 0, lineHeight: 1.5 },
          content: [{ type: 'text', text: 'Carta' }],
        },
      ],
    });
  });
  it('retains image identity while removing rendered src and unsafe attributes', () => {
    const assetId = '11111111-1111-4111-8111-111111111111';
    expect(
      documentContentFromEditor({
        type: 'doc',
        content: [
          { type: 'image', attrs: { assetId, src: '/api/assets/x', alt: 'Mapa', onerror: 'bad' } },
        ],
      }),
    ).toEqual({ type: 'doc', content: [{ type: 'image', attrs: { assetId, alt: 'Mapa' } }] });
  });
});
