import { describe, expect, it } from 'vitest';
import {
  broadcastMail,
  broadcastMailSpec,
} from '../../../src/modules/broadcasts/broadcast-mail.mapper';

const PUBLIC_URL = 'https://app.lorkarium.com.br';
const person = { to: 'bia@mesa.com', name: 'Bia', username: 'biaflor' };
const letter = {
  subject: 'Os preços mudam em 30 dias',
  title: 'Novos preços dos planos',
  paragraphs: ['A partir de 1º de janeiro o Narrador custa R$ 19,90.', 'Nada muda até lá.'],
  button: { label: 'Ver os planos', href: 'https://lorkarium.com.br/planos' },
};

describe('broadcastMailSpec', () => {
  it('greets the person in the first paragraph and keeps the others as written', () => {
    const spec = broadcastMailSpec({ person, letter, publicUrl: PUBLIC_URL, replyTo: null });
    expect(spec.paragraphs).toEqual([
      'Oi, Bia! A partir de 1º de janeiro o Narrador custa R$ 19,90.',
      'Nada muda até lá.',
    ]);
  });

  it('is a gold service notice with the title, the button and the fixed footer', () => {
    const spec = broadcastMailSpec({ person, letter, publicUrl: PUBLIC_URL, replyTo: null });
    expect(spec).toMatchObject({
      subject: 'Os preços mudam em 30 dias',
      tone: 'gold',
      title: 'Novos preços dos planos',
      button: { label: 'Ver os planos', href: 'https://lorkarium.com.br/planos' },
      footer: ['Este aviso faz parte do serviço do Lorkarium e não pode ser desligado.'],
    });
  });

  it('the preheader is the first paragraph, cut at 100 characters', () => {
    const long = { ...letter, paragraphs: ['x'.repeat(150)] };
    const spec = broadcastMailSpec({ person, letter: long, publicUrl: PUBLIC_URL, replyTo: null });
    expect(spec.preheader).toBe(`${'x'.repeat(99)}…`);
  });

  it('without a button the spec has none', () => {
    const bare = { ...letter, button: null };
    const spec = broadcastMailSpec({ person, letter: bare, publicUrl: PUBLIC_URL, replyTo: null });
    expect(spec.button).toBeUndefined();
  });

  it('with a reply-to the note asks to answer the e-mail', () => {
    const replyTo = 'contato@lorkarium.com.br';
    const spec = broadcastMailSpec({ person, letter, publicUrl: PUBLIC_URL, replyTo });
    expect(spec.note).toBe('Dúvidas? É só responder a este e-mail.');
  });

  it('without a reply-to the note points to the Contato of the site', () => {
    const spec = broadcastMailSpec({ person, letter, publicUrl: PUBLIC_URL, replyTo: null });
    expect(spec.note).toBe('Dúvidas? Fale com a gente pelo Contato do site do Lorkarium.');
  });
});

describe('broadcastMail', () => {
  it('goes to the person with the reply-to and every paragraph, the link and the footer in the text', () => {
    const replyTo = 'contato@lorkarium.com.br';
    const message = broadcastMail({ person, letter, publicUrl: PUBLIC_URL, replyTo });
    expect(message).toMatchObject({ to: 'bia@mesa.com', subject: letter.subject, replyTo });
    expect(message.text).toContain('Nada muda até lá.');
    expect(message.text).toContain('Ver os planos: https://lorkarium.com.br/planos');
    expect(message.text).toContain('não pode ser desligado');
  });

  it('without a reply-to the message carries no replyTo field', () => {
    const message = broadcastMail({ person, letter, publicUrl: PUBLIC_URL, replyTo: null });
    expect('replyTo' in message).toBe(false);
  });

  it('escapes what the admin wrote in the HTML', () => {
    const risky = { ...letter, paragraphs: ['<script>alert(1)</script>'] };
    const message = broadcastMail({ person, letter: risky, publicUrl: PUBLIC_URL, replyTo: null });
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });
});
