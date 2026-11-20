import { dataExportDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  profileImagesOf,
  sentImageOf,
  toDataExportDto,
} from '../../../src/modules/data-export/data-export.mapper';
import { DataCipherFake } from '../../support/auth-fakes';
import {
  ANA_ID,
  BIA_AVATAR_ID,
  BIA_BANNER_ID,
  BIA_TEXTURE_ID,
  MAP_ASSET_ID,
  VHARN_ID,
  emptyExportParts,
  exportedAccountRow,
  sentAssetRow,
} from '../../support/data-export-fakes';
import { feedbackEntryPo } from '../../support/feedback-fakes';

const NOW = new Date('2026-11-19T14:30:00Z');
const AT = new Date('2026-11-02T09:00:00Z');
const cipher = new DataCipherFake();

describe('toDataExportDto', () => {
  it('the account carries the opened e-mail, the plan, the dates and the 2FA moment', () => {
    const account = exportedAccountRow({
      plan: 'narrador',
      termsAcceptedAt: AT,
      termsVersion: '2026-11-18',
    });

    const dto = toDataExportDto(emptyExportParts({ account, twoFactorEnabledAt: AT }), cipher, NOW);

    expect(dto.account).toEqual({
      id: ANA_ID,
      username: 'ana',
      name: 'Ana',
      email: 'ana@mesa.com',
      role: 'user',
      plan: 'narrador',
      paidPlan: null,
      paidPlanUntil: null,
      createdAt: '2026-10-01T12:00:00.000Z',
      lastSeenAt: null,
      passwordChangedAt: null,
      termsAcceptedAt: '2026-11-02T09:00:00.000Z',
      termsVersion: '2026-11-18',
      twoFactorEnabledAt: '2026-11-02T09:00:00.000Z',
      suspendedAt: null,
      suspendedUntil: null,
    });
  });

  it('a row carrying the password hash and the blind index leaves neither in the JSON', () => {
    const text = JSON.stringify(toDataExportDto(emptyExportParts(), cipher, NOW));

    expect(text).not.toContain('$argon2id$fake');
    expect(text).not.toContain('idx:email-index');
    expect(text).not.toContain('sealed:user-email');
  });

  it('the whole output passes the strict dataExportDto (no field outside the contract)', () => {
    const parts = emptyExportParts({
      account: exportedAccountRow({ avatarId: BIA_AVATAR_ID }),
      assets: [sentAssetRow()],
      sessions: [
        { userAgent: 'Firefox', persistent: true, createdAt: AT, lastSeenAt: AT, expiresAt: NOW },
      ],
    });

    const parsed = dataExportDto.safeParse(toDataExportDto(parts, cipher, NOW));

    expect(parsed.success).toBe(true);
  });

  it('the profile points at the archive paths of the images the account has, null for the rest', () => {
    const account = exportedAccountRow({
      avatarId: BIA_AVATAR_ID,
      diceTextureId: BIA_TEXTURE_ID,
      bio: 'Mestre de Vharn',
    });

    const { profile } = toDataExportDto(emptyExportParts({ account }), cipher, NOW);

    expect(profile).toMatchObject({
      bio: 'Mestre de Vharn',
      photo: 'imagens/perfil/foto.webp',
      banner: null,
      diceTexture: 'imagens/perfil/textura-dos-dados.webp',
    });
  });

  it('the votes given name the account voted on; the received ones leave only as the summary', () => {
    const parts = emptyExportParts({
      votesGiven: [{ username: 'caio', value: -1, createdAt: AT, updatedAt: NOW }],
      reputationReceived: { up: 4, down: 1, myVote: null, percent: 80 },
    });

    const { reputation } = toDataExportDto(parts, cipher, NOW);

    expect(reputation).toEqual({
      votesGiven: [
        {
          username: 'caio',
          value: -1,
          createdAt: '2026-11-02T09:00:00.000Z',
          updatedAt: '2026-11-19T14:30:00.000Z',
        },
      ],
      received: { up: 4, down: 1, percent: 80 },
    });
  });

  it('a report made reads with when it closed and without the admin note', () => {
    const report = {
      targetUsername: 'caio',
      targetName: 'Caio',
      campaignName: 'Vharn',
      reason: 'spam' as const,
      details: 'flood no chat',
      status: 'resolved' as const,
      createdAt: AT,
      resolvedAt: NOW,
    };

    const { reportsMade } = toDataExportDto(
      emptyExportParts({ reportsMade: [report] }),
      cipher,
      NOW,
    );

    expect(reportsMade).toEqual([
      {
        targetUsername: 'caio',
        targetName: 'Caio',
        campaignName: 'Vharn',
        reason: 'spam',
        details: 'flood no chat',
        status: 'resolved',
        createdAt: '2026-11-02T09:00:00.000Z',
        closedAt: '2026-11-19T14:30:00.000Z',
      },
    ]);
  });

  it('a waiting bug report carries its sections, platform, version and day, never the @', () => {
    const entry = feedbackEntryPo({ createdAt: AT, senderUsername: 'biaflor' });

    const { feedback } = toDataExportDto(emptyExportParts({ feedbackSent: [entry] }), cipher, NOW);

    expect(feedback).toEqual([
      {
        content: {
          kind: 'bug',
          steps: '1. Abri a mesa\n2. Arrastei o token',
          expected: 'O token andar',
          actual: 'O token voltou para a casa de antes',
        },
        platform: 'browser',
        appVersion: 'Chrome 142',
        sentAt: '2026-11-02T09:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(feedback)).not.toContain('biaflor');
  });

  it('a measure received carries its rule, statement and the appeal decision', () => {
    const sanction = {
      kind: 'suspension' as const,
      rule: 'harassment' as const,
      statement: 'Mensagens ofensivas repetidas.',
      until: NOW,
      issuedAt: AT,
      appealReceivedAt: AT,
      appealOutcome: 'upheld' as const,
      appealNote: 'Mantida.',
      appealDecidedAt: NOW,
    };

    const [exported] = toDataExportDto(
      emptyExportParts({ sanctions: [sanction] }),
      cipher,
      NOW,
    ).sanctions;

    expect(exported).toEqual({
      ...sanction,
      until: '2026-11-19T14:30:00.000Z',
      issuedAt: '2026-11-02T09:00:00.000Z',
      appealReceivedAt: '2026-11-02T09:00:00.000Z',
      appealDecidedAt: '2026-11-19T14:30:00.000Z',
    });
  });

  it('each character carries only its own bars, in the order read', () => {
    const card = {
      campaignId: VHARN_ID,
      initials: 'TH',
      side: 'ally' as const,
      armorClass: 15,
      difficultyClass: null,
      noteOne: null,
      noteTwo: null,
      defeated: false,
      createdAt: AT,
      updatedAt: AT,
    };
    const parts = emptyExportParts({
      characters: [
        { ...card, id: 'char-thal', name: 'Thalia' },
        { ...card, id: 'char-rho', name: 'Rho' },
      ],
      bars: [
        { characterId: 'char-thal', label: 'PV', current: 12, max: 20, temp: 0 },
        { characterId: 'char-rho', label: 'PV', current: 3, max: 9, temp: 2 },
        { characterId: 'char-thal', label: 'Mana', current: 5, max: 5, temp: 0 },
      ],
    });

    const [thalia] = toDataExportDto(parts, cipher, NOW).characters;

    expect(thalia?.bars).toEqual([
      { label: 'PV', current: 12, max: 20, temp: 0 },
      { label: 'Mana', current: 5, max: 5, temp: 0 },
    ]);
  });

  it('each document carries only its own readable tabs with their content', () => {
    const doc = { campaignId: VHARN_ID, previewSummary: null, createdAt: AT, updatedAt: AT };
    const parts = emptyExportParts({
      documents: [{ ...doc, id: 'doc-diario', name: 'Diário' }],
      tabs: [
        { documentId: 'doc-diario', name: 'Sessão 1', content: { type: 'doc', content: [] } },
        { documentId: 'doc-outro', name: 'Segredo', content: { type: 'doc' } },
      ],
    });

    const [diario] = toDataExportDto(parts, cipher, NOW).documents;

    expect(diario?.tabs).toEqual([{ name: 'Sessão 1', content: { type: 'doc', content: [] } }]);
  });

  it('a sent image lists under the path the archive files it at', () => {
    const { images } = toDataExportDto(emptyExportParts({ assets: [sentAssetRow()] }), cipher, NOW);

    expect(images).toEqual([
      {
        path: `imagens/mesas/${VHARN_ID}/${MAP_ASSET_ID}.png`,
        campaignId: VHARN_ID,
        purpose: 'library_map',
        mimeType: 'image/png',
        sizeBytes: 2048,
        createdAt: '2026-11-01T10:00:00.000Z',
      },
    ]);
  });
});

describe('profileImagesOf', () => {
  it('the photo, banner and texture map to fixed names and their bucket keys', () => {
    const account = exportedAccountRow({
      avatarId: BIA_AVATAR_ID,
      bannerId: BIA_BANNER_ID,
      diceTextureId: BIA_TEXTURE_ID,
    });

    expect(profileImagesOf(account)).toEqual([
      { path: 'imagens/perfil/foto.webp', storageKey: `avatars/${BIA_AVATAR_ID}` },
      { path: 'imagens/perfil/banner.webp', storageKey: `banners/${BIA_BANNER_ID}` },
      {
        path: 'imagens/perfil/textura-dos-dados.webp',
        storageKey: `dice-textures/${BIA_TEXTURE_ID}`,
      },
    ]);
  });

  it('an account without images has none to add', () => {
    expect(profileImagesOf(exportedAccountRow())).toEqual([]);
  });
});

describe('sentImageOf', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['font/woff2', 'woff2'],
  ] as const)('a %s asset is filed with the .%s extension', (mimeType, extension) => {
    expect(sentImageOf(sentAssetRow({ mimeType })).path).toBe(
      `imagens/mesas/${VHARN_ID}/${MAP_ASSET_ID}.${extension}`,
    );
  });
});
