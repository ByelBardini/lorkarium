import { describe, expect, it } from 'vitest';
import {
  confirmMailBroadcastRequestDto,
  mailBroadcastContentDto,
  mailBroadcastSegmentDto,
} from '../../src/broadcasts/mail-broadcast.dto';

const NOTICE = {
  segment: 'all',
  subject: 'Os preços mudam em 30 dias',
  title: 'Novos preços',
  paragraphs: ['A partir de 1º de janeiro o Narrador custa R$ 19,90.'],
};

function pathsOf(body: unknown): string[] {
  const result = mailBroadcastContentDto.safeParse(body);
  return (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
}

describe('mailBroadcastSegmentDto', () => {
  it.each([['all'], ['paid'], [{ plan: 'narrador' }], [{ plan: 'lenda' }]])(
    'segment %o is accepted',
    (segment) => {
      expect(mailBroadcastSegmentDto.parse(segment)).toEqual(segment);
    },
  );

  it.each([['admins'], [{ plan: 'amigo_do_dono' }], [{ plan: 'free' }], [{ plan: 'lenda', x: 1 }]])(
    'segment %o is refused (only the plans on sale)',
    (segment) => {
      expect(mailBroadcastSegmentDto.safeParse(segment).success).toBe(false);
    },
  );
});

describe('mailBroadcastContentDto', () => {
  it('trims the texts and keeps the button with an https link', () => {
    const body = {
      ...NOTICE,
      subject: '  Os preços mudam em 30 dias ',
      paragraphs: [' Primeiro. ', 'Segundo.'],
      button: { label: ' Ver os planos ', href: 'https://lorkarium.com.br/planos' },
    };
    expect(mailBroadcastContentDto.parse(body)).toEqual({
      ...NOTICE,
      paragraphs: ['Primeiro.', 'Segundo.'],
      button: { label: 'Ver os planos', href: 'https://lorkarium.com.br/planos' },
    });
  });

  it('a subject of 121 characters is refused at subject', () => {
    expect(pathsOf({ ...NOTICE, subject: 'a'.repeat(121) })).toEqual(['subject']);
  });

  it('a subject of exactly 120 characters is accepted', () => {
    expect(pathsOf({ ...NOTICE, subject: 'a'.repeat(120) })).toEqual([]);
  });

  it('a blank paragraph is refused at its index', () => {
    expect(pathsOf({ ...NOTICE, paragraphs: ['Um.', '   '] })).toEqual(['paragraphs.1']);
  });

  it.each([
    [0, ['paragraphs']],
    [20, []],
    [21, ['paragraphs']],
  ])('%i paragraphs give the issues %o (1 to 20)', (count, paths) => {
    const paragraphs = Array.from({ length: count }, (_, index) => `Parágrafo ${index}.`);
    expect(pathsOf({ ...NOTICE, paragraphs })).toEqual(paths);
  });

  it.each([
    ['http://lorkarium.com.br/planos'],
    ['javascript:alert(1)'],
    ['/planos'],
    ['mailto:contato@lorkarium.com.br'],
  ])('button link %s is refused at button.href, citing the value', (href) => {
    const result = mailBroadcastContentDto.safeParse({ ...NOTICE, button: { label: 'Ver', href } });
    const issue = result.error?.issues[0];
    expect(issue?.path).toEqual(['button', 'href']);
    expect(issue?.message).toContain(href);
  });

  it('an extra field is refused (strict)', () => {
    expect(mailBroadcastContentDto.safeParse({ ...NOTICE, createdBy: 'x' }).success).toBe(false);
  });
});

describe('confirmMailBroadcastRequestDto', () => {
  it.each([[0], [-1], [1.5]])('typed total %s is refused (a whole count from 1)', (total) => {
    expect(confirmMailBroadcastRequestDto.safeParse({ total }).success).toBe(false);
  });

  it('typed total 1240 is accepted', () => {
    expect(confirmMailBroadcastRequestDto.parse({ total: 1240 })).toEqual({ total: 1240 });
  });
});
