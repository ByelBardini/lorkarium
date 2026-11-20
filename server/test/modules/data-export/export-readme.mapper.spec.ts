import { describe, expect, it } from 'vitest';
import {
  exportFileNameOf,
  exportReadmeOf,
} from '../../../src/modules/data-export/export-readme.mapper';

const NOW = new Date('2026-11-19T14:30:00Z');

describe('exportReadmeOf', () => {
  it('names the account and the moment the archive was made', () => {
    const text = exportReadmeOf({ username: 'bia', exportedAt: NOW, missingImages: [] });

    expect(text).toContain(
      'Seus dados do Lorkarium (@bia)\r\nGerado em 2026-11-19T14:30:00.000Z (UTC).',
    );
  });

  it('points the payment data to the "Dados de pagamento" button', () => {
    const text = exportReadmeOf({ username: 'bia', exportedAt: NOW, missingImages: [] });

    expect(text).toContain(
      'Dados de pagamento: ficam no serviço de cobrança. Baixe em Minha conta, botão "Dados de pagamento".',
    );
  });

  it('sends what the archive leaves out to the privacy e-mail, answered in 15 days', () => {
    const text = exportReadmeOf({ username: 'bia', exportedAt: NOW, missingImages: [] });

    expect(text).toContain('O resto, por e-mail');
    expect(text).toContain('peça a privacidade@evolutivasistemas.com.br');
    expect(text).toContain('Respondemos em até 15 dias.');
  });

  it('a missing image becomes one line under its own heading', () => {
    const missing = ['imagens/perfil/banner.webp', 'imagens/mesas/m/a.png'];

    const text = exportReadmeOf({ username: 'bia', exportedAt: NOW, missingImages: missing });

    expect(text).toContain(
      'Imagens que não puderam ser incluídas\r\n\r\n- imagens/perfil/banner.webp: o arquivo não estava mais no armazenamento.\r\n- imagens/mesas/m/a.png: o arquivo não estava mais no armazenamento.',
    );
  });

  it('without missing images there is no such heading', () => {
    const text = exportReadmeOf({ username: 'bia', exportedAt: NOW, missingImages: [] });

    expect(text).not.toContain('Imagens que não puderam ser incluídas');
  });
});

describe('exportFileNameOf', () => {
  it('carries the @ and the UTC day of the export', () => {
    expect(exportFileNameOf('bia', new Date('2026-11-19T23:59:00-03:00'))).toBe(
      'lorkarium-dados-bia-2026-11-20.zip',
    );
  });
});
