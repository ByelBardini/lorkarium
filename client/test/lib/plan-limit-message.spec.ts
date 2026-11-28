import { PLAN_COUNT_RESOURCES, PLAN_FEATURE_RESOURCES } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { amountText, planLimitMessage } from '@/lib/plan-limit-message';

describe('planLimitMessage', () => {
  it('names the ceiling of the table owner plan and the plan that frees more', () => {
    expect(planLimitMessage({ resource: 'scenes', limit: 3, plan: 'free' })).toBe(
      'Esta mesa usa o plano Grátis, que permite até 3 grids. O Narrador libera 15.',
    );
  });

  it('points a Narrador table at Lenda, with its article', () => {
    expect(planLimitMessage({ resource: 'lights', limit: 30, plan: 'narrador' })).toBe(
      'Esta mesa usa o plano Narrador, que permite até 30 luzes por cena. A Lenda libera 100.',
    );
  });

  it('skips a plan above that frees no more (a ceiling of 4 bars skips the Narrador, also 4)', () => {
    expect(planLimitMessage({ resource: 'tokenBars', limit: 4, plan: 'free' })).toBe(
      'Esta mesa usa o plano Grátis, que permite até 4 barras por token. A Lenda libera 8.',
    );
  });

  it('names no plan above when the next one has the same ceiling (Lenda also has 8 bars)', () => {
    expect(planLimitMessage({ resource: 'tokenBars', limit: 8, plan: 'narrador' })).toBe(
      'Esta mesa usa o plano Narrador, que permite até 8 barras por token.',
    );
  });

  it('speaks of the person own plan for the tables they own, in the singular at 1', () => {
    expect(planLimitMessage({ resource: 'campaigns', limit: 1, plan: 'free' })).toBe(
      'Seu plano Grátis permite até 1 mesa como dono. O Narrador libera 3.',
    );
  });

  it('writes storage in MB and GB', () => {
    expect(planLimitMessage({ resource: 'storage', limit: 100 * 1024 ** 2, plan: 'free' })).toBe(
      'Esta mesa usa o plano Grátis, que permite até 100 MB de arquivos. O Narrador libera 1 GB.',
    );
  });

  it('says a feature the plan lacks is in the cheapest plan that has it', () => {
    expect(planLimitMessage({ resource: 'auraKind', limit: 0, plan: 'free' })).toBe(
      'Aura com efeito ou imagem está no plano Lenda.',
    );
  });

  it.each([
    ['sheetScripts', 'Scripts no modelo de ficha estão no plano Narrador.'],
    ['animatedCampaignArt', 'Imagens animadas da mesa estão no plano Lenda.'],
  ] as const)(
    'the %s refusal is the sentence of a missing feature, never a ceiling',
    (resource, sentence) => {
      expect(planLimitMessage({ resource, limit: 0, plan: 'free' })).toBe(sentence);
    },
  );

  it('says a ceiling of 0 is a resource the plan lacks, not "até 0"', () => {
    expect(planLimitMessage({ resource: 'patrols', limit: 0, plan: 'free' })).toBe(
      'Patrulha está nos planos pagos.',
    );
  });

  it('tells Lenda its fair use, with no plan above', () => {
    expect(planLimitMessage({ resource: 'scenes', limit: 500, plan: 'lenda' })).toBe(
      'Esta mesa chegou ao limite de uso justo (500 grids).',
    );
  });

  it('names no plan above Lenda for a ceiling outside fair use', () => {
    expect(planLimitMessage({ resource: 'players', limit: 20, plan: 'lenda' })).toBe(
      'Esta mesa usa o plano Lenda, que permite até 20 jogadores.',
    );
  });

  it('never offers Amigo do Dono, which is given and not bought', () => {
    expect(planLimitMessage({ resource: 'lights', limit: 100, plan: 'lenda' })).not.toContain(
      'Amigo',
    );
  });

  it('an Apoiador table points at the Narrador, never at the Apoiador', () => {
    expect(planLimitMessage({ resource: 'scenes', limit: 3, plan: 'apoiador' })).toBe(
      'Esta mesa usa o plano Apoiador, que permite até 3 grids. O Narrador libera 15.',
    );
    expect(planLimitMessage({ resource: 'campaigns', limit: 1, plan: 'free' })).not.toContain(
      'O Apoiador',
    );
  });

  it.each([
    ['desktopWindows', 'narrador', 'As janelas de Chat e Imagens estão no plano Lenda.'],
    ['auraKind', 'narrador', 'Aura com efeito ou imagem está no plano Lenda.'],
    ['animatedCampaignArt', 'narrador', 'Imagens animadas da mesa estão no plano Lenda.'],
    ['sceneCopy', 'free', 'Duplicar grid está no plano Narrador.'],
  ] as const)(
    'a %s refusal on %s names the cheapest plan that has it',
    (resource, plan, sentence) => {
      expect(planLimitMessage({ resource, limit: 0, plan })).toBe(sentence);
    },
  );

  it('an account customization names the paid plans (the Apoiador frees it, outside the table grid)', () => {
    expect(planLimitMessage({ resource: 'diceTexture', limit: 0, plan: 'free' })).toBe(
      'Textura própria do dado está nos planos pagos.',
    );
  });

  it('the banner of the profile names the Lenda, on Grátis as on Narrador', () => {
    for (const plan of ['free', 'apoiador', 'narrador'] as const) {
      expect(planLimitMessage({ resource: 'profileBanner', limit: 0, plan })).toBe(
        'Banner de perfil está no plano Lenda.',
      );
    }
  });

  it('a ceiling given by the person’s own plan speaks of her plan, and the next plan frees more', () => {
    const planLimit = {
      resource: 'savedRolls',
      limit: 15,
      plan: 'apoiador',
      holder: 'account',
    } as const;
    expect(planLimitMessage(planLimit)).toBe(
      'Seu plano Apoiador permite até 15 rolagens salvas por pessoa. A Lenda libera 50.',
    );
  });

  it('a folder ceiling of the person’s Narrador speaks of her plan too', () => {
    const planLimit = {
      resource: 'savedRollFolders',
      limit: 5,
      plan: 'narrador',
      holder: 'account',
    } as const;
    expect(planLimitMessage(planLimit)).toBe(
      'Seu plano Narrador permite até 5 pastas de rolagens por pessoa. A Lenda libera 50.',
    );
  });

  it('a ceiling given by the table keeps the sentence of the table, with or without the holder', () => {
    const sentence =
      'Esta mesa usa o plano Grátis, que permite até 3 rolagens salvas por pessoa. O Narrador libera 15.';
    expect(planLimitMessage({ resource: 'savedRolls', limit: 3, plan: 'free' })).toBe(sentence);
    expect(
      planLimitMessage({ resource: 'savedRolls', limit: 3, plan: 'free', holder: 'table' }),
    ).toBe(sentence);
  });

  it('has a sentence for every resource of the contract', () => {
    for (const resource of [...PLAN_COUNT_RESOURCES, ...PLAN_FEATURE_RESOURCES]) {
      expect(planLimitMessage({ resource, limit: 0, plan: 'free' })).toMatch(
        /(planos pagos|no plano Narrador|no plano Lenda)\.$/,
      );
    }
  });
});

describe('planLimitMessage with reason readOnly', () => {
  it('a grid past the free ceiling is read only: delete an older one or move up', () => {
    expect(
      planLimitMessage({ resource: 'scenes', limit: 3, plan: 'free', reason: 'readOnly' }),
    ).toBe(
      'Este grid passou do limite do plano Grátis (3) e está só leitura. Apague um grid mais antigo ou suba de plano.',
    );
  });

  it.each([
    [
      'libraryMaps',
      0,
      'free',
      'Este mapa interativo passou do limite do plano Grátis (0) e está só leitura: mostrar, Principal e apagar seguem livres. Apague um mapa mais antigo ou suba de plano.',
    ],
    [
      'sheetTemplates',
      1,
      'free',
      'Este modelo de ficha passou do limite do plano Grátis (1) e está só leitura: criar fichas com ele segue livre. Apague um modelo mais antigo ou suba de plano.',
    ],
    [
      'documentTabs',
      3,
      'free',
      'Esta aba passou do limite do plano Grátis (3) e está só leitura: ocultar, reordenar e excluir seguem livres. Apague uma aba mais antiga deste documento ou suba de plano.',
    ],
    [
      'savedRolls',
      3,
      'free',
      'Esta rolagem salva passou do limite do plano Grátis (3) e está só leitura: rolar, mover para pasta e excluir seguem livres. Apague uma rolagem mais antiga ou suba de plano.',
    ],
    [
      'tokenBars',
      1,
      'free',
      'Esta barra passou do limite do plano Grátis (1) e está só leitura: o valor muda; nome, máximo e cor não. Apague uma barra acima dela ou suba de plano.',
    ],
    [
      'tokenForms',
      2,
      'free',
      'Esta forma passou do limite do plano Grátis (2) e está só leitura: trocar para ela segue livre; nome e imagem não. Apague uma forma antes dela ou suba de plano.',
    ],
    [
      'lights',
      10,
      'free',
      'Esta luz passou do limite do plano Grátis (10) e está só leitura: acender e apagar seguem livres. Exclua uma luz mais antiga ou suba de plano.',
    ],
    [
      'patrols',
      3,
      'narrador',
      'Esta patrulha passou do limite do plano Narrador (3) e está só leitura: pause a patrulha para mudar a rota. Pause uma patrulha mais antiga ou suba de plano.',
    ],
    [
      'sightBlockers',
      5,
      'narrador',
      'Este token que bloqueia a visão passou do limite do plano Narrador (5) e está só leitura: desligar o bloqueio segue livre. Desligue um bloqueio mais antigo ou suba de plano.',
    ],
  ] as const)('a %s past the ceiling of %s says what stays free', (resource, limit, plan, text) => {
    expect(planLimitMessage({ resource, limit, plan, reason: 'readOnly' })).toBe(text);
  });

  it('a readOnly reason on a resource that never locks falls back to the ceiling sentence', () => {
    expect(
      planLimitMessage({ resource: 'campaigns', limit: 1, plan: 'free', reason: 'readOnly' }),
    ).toBe('Seu plano Grátis permite até 1 mesa como dono. O Narrador libera 3.');
  });

  it('reason room reads as the creation refusal of today', () => {
    expect(planLimitMessage({ resource: 'scenes', limit: 3, plan: 'free', reason: 'room' })).toBe(
      'Esta mesa usa o plano Grátis, que permite até 3 grids. O Narrador libera 15.',
    );
  });
});

describe('amountText', () => {
  it('uses the singular for one', () => {
    expect(amountText('lights', 1)).toBe('1 luz por cena');
  });

  it('names the round cycles and their phases of a Grátis table, and what frees more', () => {
    expect(planLimitMessage({ resource: 'roundCycles', limit: 1, plan: 'free' })).toBe(
      'Esta mesa usa o plano Grátis, que permite até 1 ciclo de rodada. O Narrador libera 3.',
    );
    expect(planLimitMessage({ resource: 'roundCyclePhases', limit: 6, plan: 'narrador' })).toBe(
      'Esta mesa usa o plano Narrador, que permite até 6 fases por ciclo. A Lenda libera 12.',
    );
  });

  it('says the image of a phase is in Narrador, and a locked cycle how to free it', () => {
    expect(
      planLimitMessage({ resource: 'roundCyclePhaseImage', limit: 0, plan: 'free' }),
    ).toContain('Imagem própria na fase do ciclo está no plano Narrador');
    const locked = { resource: 'roundCycles', limit: 1, plan: 'free', reason: 'readOnly' } as const;
    expect(planLimitMessage(locked)).toContain('Apague um ciclo mais antigo');
  });
});
