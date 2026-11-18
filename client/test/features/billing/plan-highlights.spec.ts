import { describe, expect, it } from 'vitest';
import { planHighlightsOf } from '@/features/billing/plan-highlights';

describe('planHighlightsOf', () => {
  it('reads the numbers of each plan from the plan limits', () => {
    expect(planHighlightsOf('free').slice(0, 2)).toEqual([
      '1 mesa como dono e 100 MB de imagens',
      '5 jogadores e 1 espectadores por mesa',
    ]);
    expect(planHighlightsOf('narrador').slice(0, 2)).toEqual([
      '3 mesas como dono e 1 GB de imagens',
      '8 jogadores e 5 espectadores por mesa',
    ]);
    expect(planHighlightsOf('lenda')[0]).toBe('10 mesas como dono e 5 GB de imagens');
  });

  it('the Apoiador keeps the tables of Grátis and opens the account', () => {
    expect(planHighlightsOf('apoiador')).toEqual([
      'Mesas com os limites do Grátis',
      'Cor própria no perfil, nos dados e nas cores salvas',
      'Textura própria para os seus dados',
      'Foto de perfil em GIF animado',
    ]);
  });

  it('the Lenda offer names the extras only it has', () => {
    expect(planHighlightsOf('lenda')).toContain(
      'Janelas de Chat e Imagens, auras com efeito e arte animada',
    );
  });

  it('the Narrador offer names what it opens over Grátis: maps, sheet scripts, private table', () => {
    expect(planHighlightsOf('narrador')).toContain(
      'Mapas interativos, scripts na ficha e mesa privada',
    );
  });

  it('the Narrador offer promises none of the extras that are only on Lenda', () => {
    expect(planHighlightsOf('narrador').join(' | ')).not.toMatch(/aura|janela|animad/i);
  });

  it('each paid plan above Apoiador includes the one before', () => {
    expect(planHighlightsOf('narrador').at(-1)).toBe('Tudo do Apoiador');
    expect(planHighlightsOf('lenda').at(-1)).toBe('Tudo do Narrador');
  });
});
