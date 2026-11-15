import { describe, expect, it } from 'vitest';
import { sectionSummaryOf } from '@/features/campaigns/settings-section-summary';
import type { SettingsValues } from '@/features/campaigns/use-campaign-settings-draft';

const ASSET = '00000000-0000-4000-8000-000000000001';

const VALUES: SettingsValues = {
  name: 'Vharn',
  system: 'D&D 5e',
  status: 'recruiting',
  description: '',
  visibility: 'private',
  contentWarnings: [],
  tags: [],
  cover: { kind: 'drawn', drawing: 0, tone: 1 },
  photoAssetId: null,
  bannerAssetId: null,
  requirePassword: false,
  password: '',
  playersCreateTokens: false,
  playersDeleteTokens: false,
};

describe('sectionSummaryOf · general', () => {
  it('says the status and the system', () => {
    expect(sectionSummaryOf('general', VALUES)).toBe('Recrutando · D&D 5e');
  });

  it('a blank system reads "sem sistema"', () => {
    expect(sectionSummaryOf('general', { ...VALUES, system: '  ' })).toBe(
      'Recrutando · sem sistema',
    );
  });
});

describe('sectionSummaryOf · images', () => {
  it('with no image sent: 0 de 3', () => {
    expect(sectionSummaryOf('images', VALUES)).toBe('0 de 3 enviadas');
  });

  it('counts the photo, the cover image and the banner', () => {
    const values: SettingsValues = {
      ...VALUES,
      photoAssetId: ASSET,
      cover: { kind: 'image', assetId: ASSET },
      bannerAssetId: ASSET,
    };
    expect(sectionSummaryOf('images', values)).toBe('3 de 3 enviadas');
  });

  it('a drawn cover is not a sent image', () => {
    expect(sectionSummaryOf('images', { ...VALUES, photoAssetId: ASSET })).toBe('1 de 3 enviadas');
  });
});

describe('sectionSummaryOf · content', () => {
  it('nothing chosen: no warnings, no tags', () => {
    expect(sectionSummaryOf('content', VALUES)).toBe('Sem avisos · sem tags');
  });

  it('singular for one, plural for more', () => {
    const one: SettingsValues = { ...VALUES, contentWarnings: ['gore'], tags: ['Roleplay'] };
    const many: SettingsValues = {
      ...VALUES,
      contentWarnings: ['gore', 'horror'],
      tags: ['Roleplay', 'Sandbox', 'One-shot'],
    };
    expect(sectionSummaryOf('content', one)).toBe('1 aviso · 1 tag');
    expect(sectionSummaryOf('content', many)).toBe('2 avisos · 3 tags');
  });
});

describe('sectionSummaryOf · access', () => {
  it.each([
    ['private', false, 'Privada · sem senha'],
    ['private', true, 'Privada · com senha'],
    ['public', false, 'Pública · sem senha'],
    ['public', true, 'Pública · com senha'],
  ] as const)('%s with password %s reads %j', (visibility, requirePassword, text) => {
    expect(sectionSummaryOf('access', { ...VALUES, visibility, requirePassword })).toBe(text);
  });
});

describe('sectionSummaryOf · players', () => {
  it('both keys off: only the master creates tokens', () => {
    expect(sectionSummaryOf('players', VALUES)).toBe('Só o mestre cria tokens');
  });

  it('create on: players create tokens', () => {
    expect(sectionSummaryOf('players', { ...VALUES, playersCreateTokens: true })).toBe(
      'Jogadores criam tokens',
    );
  });

  it('create and delete on: players create and delete', () => {
    const values = { ...VALUES, playersCreateTokens: true, playersDeleteTokens: true };
    expect(sectionSummaryOf('players', values)).toBe('Jogadores criam e excluem tokens');
  });
});

describe('sectionSummaryOf · danger', () => {
  it('names the one action there', () => {
    expect(sectionSummaryOf('danger', VALUES)).toBe('Excluir a mesa');
  });
});
