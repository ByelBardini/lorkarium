import { apiErrorDto, dataExportDto, type DataExportDto } from '@lorkarium/contracts';
import { unzipSync } from 'fflate';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import { assets } from '../../src/modules/assets/assets.po';
import { characters } from '../../src/modules/characters/characters.po';
import { reputationVotes } from '../../src/modules/reputation/reputation-votes.po';
import { SavedTokenFoldersDao } from '../../src/modules/saved-tokens/saved-token-folders.dao';
import { SavedTokensDao } from '../../src/modules/saved-tokens/saved-tokens.dao';
import { rottenFormPo, savedTokenPo } from '../support/saved-tokens-factories';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const EXPORT_URL = '/api/account/export';

function exportOf(user: SignedInUser | null): Promise<LightMyRequestResponse> {
  return live.http(user, { method: 'GET', url: EXPORT_URL });
}

function filesOf(response: LightMyRequestResponse): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(response.rawPayload));
}

function dadosOf(files: Record<string, Uint8Array>): DataExportDto {
  return dataExportDto.parse(JSON.parse(new TextDecoder().decode(files['dados.json'])));
}

/** What Bia left at Quelm, a table she does not sit at: a character and an image she sent. */
async function leaveBiaTracesAtQuelm(): Promise<void> {
  const { db } = live.connection;
  const quelm = live.quelm.id;
  await db.insert(characters).values({
    campaignId: quelm,
    userId: live.bia.id,
    name: 'Sombra de Quelm',
    initials: 'SQ',
    side: 'enemy',
  });
  await db.insert(assets).values({
    campaignId: quelm,
    ownerId: live.bia.id,
    purpose: 'token',
    mimeType: 'image/png',
    sizeBytes: 10,
    width: 1,
    height: 1,
    storageKey: `campaigns/${quelm}/left-by-bia`,
  });
}

describe('GET /api/account/export', () => {
  it('answers a ZIP to save, with dados.json, LEIA-ME.txt and the image Bia sent', async () => {
    const image = await live.sendImage(live.bia, live.vharn);

    const response = await exportOf(live.bia);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="lorkarium-dados-bia-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
    const files = filesOf(response);
    const extension = image.mimeType === 'image/webp' ? 'webp' : 'png';
    const imagePath = `imagens/mesas/${live.vharn.id}/${image.id}.${extension}`;
    expect(Object.keys(files).sort()).toEqual(['LEIA-ME.txt', 'dados.json', imagePath]);
    expect(dadosOf(files).images[0]?.sizeBytes).toBe(files[imagePath]?.byteLength);
  });

  it('dados.json is the session account: opened e-mail, the table and its role', async () => {
    const dados = dadosOf(filesOf(await exportOf(live.bia)));

    expect(dados.account).toMatchObject({
      id: live.bia.id,
      username: 'bia',
      email: 'bia@mesa.com',
    });
    expect(dados.campaigns).toEqual([
      expect.objectContaining({
        id: live.vharn.id,
        name: 'Os Sinos de Vharn',
        role: 'player',
        owner: false,
      }),
    ]);
  });

  it("Bia's export brings nothing from a table she does not sit at, not even what she left there", async () => {
    await leaveBiaTracesAtQuelm();

    const files = filesOf(await exportOf(live.bia));
    const dados = dadosOf(files);

    const everything = JSON.stringify(dados) + Object.keys(files).join(' ');
    expect(everything).not.toContain(live.quelm.id);
    expect(everything).not.toContain('Quelm');
    // Joining Vharn as a player seated her own character there; that one is hers to take.
    expect(dados.characters.map((character) => character.campaignId)).toEqual([live.vharn.id]);
    expect(dados.images).toEqual([]);
  });

  it('dados.json brings the saved tokens of Bia with their folder, not those of Caio', async () => {
    const { db } = live.connection;
    const bia = { campaignId: live.vharn.id, userId: live.bia.id };
    const folder = await new SavedTokenFoldersDao(db).insert({
      ...bia,
      name: 'Mortos',
      nameKey: 'mortos',
    });
    const tokens = new SavedTokensDao(db);
    await tokens.insert(savedTokenPo(bia, { folderId: folder.id }), [rottenFormPo()]);
    await tokens.insert(
      savedTokenPo({ campaignId: live.vharn.id, userId: live.caio.id }, { name: 'Do Caio' }),
      [],
    );

    const { savedTokens } = dadosOf(filesOf(await exportOf(live.bia)));

    expect(savedTokens.map((entry) => [entry.name, entry.folder])).toEqual([['Zumbi', 'Mortos']]);
    expect(savedTokens[0]?.token.forms.map((form) => form.name)).toEqual(['Podre']);
  });

  it('never carries the password hash nor the session token, and the votes received only as a sum', async () => {
    await live.connection.db
      .insert(reputationVotes)
      .values({ voterId: live.caio.id, targetId: live.bia.id, value: 1 });

    const zip = filesOf(await exportOf(live.bia));
    const text = new TextDecoder().decode(zip['dados.json']);

    expect(text).not.toContain('$argon2id');
    expect(text).not.toContain(live.bia.token);
    expect(dadosOf(zip).reputation.received).toEqual({ up: 1, down: 0, percent: null });
    expect(text).not.toContain(live.caio.id);
  });

  it('without a session answers 401', async () => {
    const response = await exportOf(null);

    expect(response.statusCode).toBe(401);
  });

  it('a second export within 24 h answers 429 EXPORT_TOO_SOON with Retry-After', async () => {
    await exportOf(live.bia);

    const second = await exportOf(live.bia);

    expect(second.statusCode).toBe(429);
    const body = apiErrorDto.parse(second.json());
    expect(body.code).toBe('EXPORT_TOO_SOON');
    expect(body.retryAfterSeconds).toBeGreaterThan(86_000);
    expect(second.headers['retry-after']).toBe(String(body.retryAfterSeconds));
  });

  it("one account's export does not hold back another's", async () => {
    await exportOf(live.bia);

    const caio = await exportOf(live.caio);

    expect(caio.statusCode).toBe(200);
  });
});
