import { describe, expect, it } from 'vitest';
import { renderMail } from '../../../src/lib/mail/mail-layout';
import type { MailSpec } from '../../../src/lib/mail/mail-spec';

const PUBLIC_URL = 'https://mesa.example.com';
const CONFIRM_URL = 'https://mesa.example.com/account/email/confirm#token=t1';

function fullSpec(overrides: Partial<MailSpec> = {}): MailSpec {
  return {
    subject: 'Confirme seu novo e-mail no Lorkarium',
    preheader: 'Clique no botão para usar este endereço.',
    tone: 'gold',
    icon: 'mailSwap',
    title: 'Confirme que este e-mail é seu',
    paragraphs: ['Oi, Ana!', 'Até você confirmar, nada muda.'],
    details: [{ label: 'Quando', value: '24 de outubro de 2026 às 03:10' }],
    button: { label: 'Confirmar novo e-mail', href: CONFIRM_URL },
    note: 'O link vale 30 minutos.',
    warning: { title: 'Não foi você?', text: 'Troque sua senha.' },
    fallbackLink: true,
    footer: ['Você recebeu porque pediu.'],
    ...overrides,
  };
}

function minimalSpec(): MailSpec {
  return {
    subject: 'Seu acesso foi suspenso',
    preheader: 'Fale com quem administra.',
    tone: 'alert',
    icon: 'pause',
    title: 'Seu acesso foi suspenso',
    paragraphs: ['Você foi desconectado.'],
    footer: ['Aviso sobre o estado da sua conta.'],
  };
}

describe('renderMail html', () => {
  it('opens as a pt-BR document locked to the light scheme, titled by the subject', () => {
    const { html } = renderMail(fullSpec(), PUBLIC_URL);
    expect(html).toContain('<html lang="pt-BR"');
    expect(html).toContain('<meta name="color-scheme" content="light only">');
    expect(html).toContain('<title>Confirme seu novo e-mail no Lorkarium</title>');
  });

  it('puts the preheader in a hidden div before the visible card', () => {
    const { html } = renderMail(fullSpec(), PUBLIC_URL);
    const preheader = html.indexOf('Clique no botão para usar este endereço.');
    expect(html.slice(html.lastIndexOf('<div', preheader), preheader)).toContain('display:none');
    expect(preheader).toBeLessThan(html.indexOf('LORKARIUM'));
  });

  it('draws the dark band with the hosted mark, the brand in text and the 3px accent rule', () => {
    const { html } = renderMail(fullSpec(), PUBLIC_URL);
    expect(html).toContain('bgcolor="#101216"');
    expect(html).toContain(
      '<img src="https://mesa.example.com/email/lorkarium-mark.png" width="30" height="30" alt=""',
    );
    expect(html).toContain('>LORKARIUM<');
    expect(html).toMatch(/height:3px;[^"]*background:#C5A46D/);
  });

  it('shows the tone icon over its circle', () => {
    const { html } = renderMail(fullSpec(), PUBLIC_URL);
    expect(html).toContain('src="https://mesa.example.com/email/icon-mail-swap-gold.png"');
    expect(html).toMatch(
      /background:#EFE3CB[^>]*>\s*<img src="https:\/\/mesa\.example\.com\/email\/icon-mail-swap-gold\.png"/,
    );
  });

  it('renders the title, one paragraph per line and one row per detail with key and bold value', () => {
    const { html } = renderMail(fullSpec(), PUBLIC_URL);
    expect(html).toContain('Confirme que este e-mail é seu</h1>');
    expect(html).toContain('>Oi, Ana!</p>');
    expect(html).toContain('>Até você confirmar, nada muda.</p>');
    expect(html).toMatch(/color:#7A7468[^>]*>Quando<\/td>/);
    expect(html).toMatch(/font-weight:600[^>]*>24 de outubro de 2026 às 03:10<\/td>/);
  });

  it('renders the gold button as a link with the tone colors', () => {
    const { html } = renderMail(fullSpec(), PUBLIC_URL);
    expect(html).toMatch(
      /bgcolor="#C5A46D"[^>]*>\s*<a href="https:\/\/mesa\.example\.com\/account\/email\/confirm#token=t1"[^>]*color:#15130F[^>]*>Confirmar novo e-mail<\/a>/,
    );
  });

  it('closes with the note, the whole fallback url and the footer with the brand line', () => {
    const { html } = renderMail(fullSpec(), PUBLIC_URL);
    expect(html).toContain('>O link vale 30 minutos.</p>');
    expect(html).toContain('O botão não funcionou? Copie e cole no navegador:');
    expect(html).toContain(`>${CONFIRM_URL}</a>`);
    expect(html).toContain('Você recebeu porque pediu.');
    expect(html).toContain('Lorkarium · mesa virtual de RPG');
  });

  it('boxes the warning in the alert colors with its title in bold', () => {
    const { html } = renderMail(fullSpec(), PUBLIC_URL);
    expect(html).toMatch(/background:#F7E6E0;[^"]*border:1px solid #E8C2B6/);
    expect(html).toContain(
      '<strong style="font-weight:700">Não foi você?</strong> Troque sua senha.',
    );
  });

  it.each([
    ['alert', '#C9705A', '#F4DCD3', '#A4472F', '#FFF5F0'],
    ['dark', '#C5A46D', '#E6E2DA', '#101216', '#E2C793'],
    ['ok', '#8FB39A', '#DCEADF', '#101216', '#E2C793'],
  ] as const)(
    'tone %s uses rule %s, icon circle %s and button %s on %s',
    (tone, rule, circle, button, label) => {
      const { html } = renderMail(fullSpec({ tone, icon: 'check' }), PUBLIC_URL);
      expect(html).toMatch(new RegExp(`height:3px;[^"]*background:${rule}`));
      expect(html).toContain(`background:${circle}`);
      expect(html).toContain(`src="https://mesa.example.com/email/icon-check-${tone}.png"`);
      expect(html).toContain(`bgcolor="${button}"`);
      expect(html).toMatch(new RegExp(`color:${label}[^>]*>Confirmar novo e-mail</a>`));
    },
  );

  it('leaves no trace of the optional blocks it was not given', () => {
    const { html } = renderMail(minimalSpec(), PUBLIC_URL);
    expect(html).not.toContain('#F7E6E0');
    expect(html).not.toContain('O botão não funcionou?');
    expect(html).not.toContain('#FBF9F4');
    expect(html).not.toContain('<a ');
    expect(html).not.toMatch(/undefined|null|NaN/);
  });

  it('escapes the person name in the title, a paragraph and a detail, and quotes in an href', () => {
    const name = '<b>Ana & "Bia"</b>';
    const spec = fullSpec({
      title: name,
      paragraphs: [name],
      details: [{ label: 'Nome', value: name }],
      button: { label: 'Abrir', href: 'https://mesa.example.com/a"b' },
    });
    const { html } = renderMail(spec, PUBLIC_URL);
    expect(html).not.toContain('<b>Ana');
    expect(html.split('&lt;b&gt;Ana &amp; &quot;Bia&quot;&lt;/b&gt;')).toHaveLength(4);
    expect(html).toContain('href="https://mesa.example.com/a&quot;b"');
  });

  it('never carries svg nor script', () => {
    const { html } = renderMail(fullSpec(), PUBLIC_URL);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<script');
  });

  it('refuses a relative button href citing the value and the expected shape', () => {
    const spec = fullSpec({ button: { label: 'Abrir', href: '/account' } });
    expect(() => renderMail(spec, PUBLIC_URL)).toThrow(/"\/account".*URL absoluta \(https:\/\/…\)/);
  });
});

describe('renderMail text', () => {
  it('reads title, paragraphs, details, button, warning, note and footer in order without tags', () => {
    const { text } = renderMail(fullSpec(), PUBLIC_URL);
    expect(text).toBe(
      [
        'Confirme que este e-mail é seu',
        'Oi, Ana!',
        'Até você confirmar, nada muda.',
        'Quando: 24 de outubro de 2026 às 03:10',
        `Confirmar novo e-mail: ${CONFIRM_URL}`,
        'Não foi você? Troque sua senha.',
        'O link vale 30 minutos.',
        'Você recebeu porque pediu.\nLorkarium · mesa virtual de RPG',
      ].join('\n\n'),
    );
  });

  it('keeps only what it was given for a minimal mail', () => {
    const { text } = renderMail(minimalSpec(), PUBLIC_URL);
    expect(text).toBe(
      [
        'Seu acesso foi suspenso',
        'Você foi desconectado.',
        'Aviso sobre o estado da sua conta.\nLorkarium · mesa virtual de RPG',
      ].join('\n\n'),
    );
  });
});
