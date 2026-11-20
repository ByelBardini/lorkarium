import { dataExportDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AssetStoragePort } from '../../../src/modules/assets/asset-storage.port';
import { DataExportBo } from '../../../src/modules/data-export/data-export.bo';
import { DataExportService } from '../../../src/modules/data-export/data-export.service';
import { AssetStorageFake } from '../../support/assets-fakes';
import { ClockFake, DataCipherFake } from '../../support/auth-fakes';
import {
  ANA_ID,
  AccountExportDaoFake,
  ArchiveWriterFake,
  BIA_AVATAR_ID,
  BIA_BANNER_ID,
  BIA_TEXTURE_ID,
  CampaignExportDaoFake,
  ExportImageLogFake,
  MAP_ASSET_ID,
  ModerationExportDaoFake,
  ReputationCountsFake,
  VHARN_ID,
  exportedAccountRow,
  sentAssetRow,
} from '../../support/data-export-fakes';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-19T14:30:00Z');
const MAP_PATH = `imagens/mesas/${VHARN_ID}/${MAP_ASSET_ID}.png`;

/** A bucket whose `open` fails as an unreachable S3 would. */
class UnreachableStorageFake implements Pick<AssetStoragePort, 'open'> {
  async open(key: string): Promise<null> {
    throw new Error(`S3 unreachable for ${key}`);
  }
}

describe('DataExportService', () => {
  let accounts: AccountExportDaoFake;
  let tables: CampaignExportDaoFake;
  let reputation: ReputationCountsFake;
  let storage: AssetStorageFake;
  let archives: ArchiveWriterFake;
  let log: ExportImageLogFake;

  function service(bucket: Pick<AssetStoragePort, 'open'> = storage): DataExportService {
    return new DataExportService({
      accounts,
      tables,
      moderation: new ModerationExportDaoFake(),
      reputation,
      storage: bucket,
      archives,
      cipher: new DataCipherFake(),
      clock: new ClockFake(NOW),
      rule: new DataExportBo(DAY_MS),
      minVotes: 5,
      log,
    });
  }

  beforeEach(async () => {
    accounts = new AccountExportDaoFake();
    accounts.account = exportedAccountRow({
      avatarId: BIA_AVATAR_ID,
      bannerId: BIA_BANNER_ID,
      diceTextureId: BIA_TEXTURE_ID,
    });
    tables = new CampaignExportDaoFake();
    tables.assets = [sentAssetRow()];
    reputation = new ReputationCountsFake();
    storage = new AssetStorageFake();
    archives = new ArchiveWriterFake();
    log = new ExportImageLogFake();
    await storage.put(`avatars/${BIA_AVATAR_ID}`, Uint8Array.from([1]), 'image/webp');
    await storage.put(`banners/${BIA_BANNER_ID}`, Uint8Array.from([2]), 'image/webp');
    await storage.put(`dice-textures/${BIA_TEXTURE_ID}`, Uint8Array.from([3]), 'image/webp');
    await storage.put(sentAssetRow().storageKey, Uint8Array.from([4, 4]), 'image/png');
  });

  it('the archive holds dados.json, LEIA-ME.txt and every image with its bytes', async () => {
    const file = await service().export(ANA_ID);
    await archives.finished;

    expect(file.fileName).toBe('lorkarium-dados-ana-2026-11-19.zip');
    expect([...archives.files.keys()]).toEqual([
      'dados.json',
      'imagens/perfil/foto.webp',
      'imagens/perfil/banner.webp',
      'imagens/perfil/textura-dos-dados.webp',
      MAP_PATH,
      'LEIA-ME.txt',
    ]);
    expect(archives.files.get(MAP_PATH)).toEqual(Uint8Array.from([4, 4]));
  });

  it('dados.json is the account of the session, valid against the strict contract', async () => {
    await service().export(ANA_ID);
    await archives.finished;

    const dados = dataExportDto.parse(JSON.parse(archives.textOf('dados.json') ?? ''));

    expect(dados.account.email).toBe('ana@mesa.com');
    expect(dados.images.map((image) => image.path)).toEqual([MAP_PATH]);
  });

  it('the LEIA-ME tells where the payment data are', async () => {
    await service().export(ANA_ID);
    await archives.finished;

    expect(archives.textOf('LEIA-ME.txt')).toContain('botão "Dados de pagamento"');
  });

  it('the export is marked at now, comparing with one interval before', async () => {
    await service().export(ANA_ID);

    expect(accounts.claims).toEqual([
      { userId: ANA_ID, now: NOW, latestAllowed: new Date('2026-11-18T14:30:00Z') },
    ]);
  });

  it('the votes received are summed for the account itself, with the minimum of votes', async () => {
    reputation.counts = { up: 3, down: 1, myVote: null };

    await service().export(ANA_ID);
    await archives.finished;

    const dados = dataExportDto.parse(JSON.parse(archives.textOf('dados.json') ?? ''));
    expect(reputation.asked).toEqual([{ targetId: ANA_ID, viewerId: ANA_ID }]);
    expect(dados.reputation.received).toEqual({ up: 3, down: 1, percent: null });
  });

  it('a second export within 24 h is refused with EXPORT_TOO_SOON before any read or mark', async () => {
    accounts.lastExports = [new Date('2026-11-19T10:00:00Z')];

    const attempt = service().export(ANA_ID);

    await expect(attempt).rejects.toMatchObject({
      code: 'EXPORT_TOO_SOON',
      nextAt: new Date('2026-11-20T10:00:00Z'),
    });
    expect(accounts.accountReads).toBe(0);
    expect(accounts.claims).toEqual([]);
  });

  it('an export that loses the race to mark is refused with EXPORT_TOO_SOON and builds nothing', async () => {
    accounts.lastExports = [null, new Date('2026-11-19T14:29:59Z')];
    accounts.claimAnswer = false;

    await expect(service().export(ANA_ID)).rejects.toMatchObject({ code: 'EXPORT_TOO_SOON' });
    expect(archives.files.size).toBe(0);
  });

  it('an image gone from the bucket becomes a LEIA-ME line and the rest of the archive stays', async () => {
    await storage.remove(`banners/${BIA_BANNER_ID}`);

    await service().export(ANA_ID);
    await archives.finished;

    expect(archives.files.has('imagens/perfil/banner.webp')).toBe(false);
    expect(archives.files.has(MAP_PATH)).toBe(true);
    expect(archives.textOf('LEIA-ME.txt')).toContain(
      '- imagens/perfil/banner.webp: o arquivo não estava mais no armazenamento.',
    );
  });

  it('a bucket that fails to open logs the key and still closes the archive with the LEIA-ME', async () => {
    await service(new UnreachableStorageFake()).export(ANA_ID);
    await archives.finished;

    expect(archives.files.has('LEIA-ME.txt')).toBe(true);
    expect(log.warnings.map((warning) => warning.fields)).toContainEqual(
      expect.objectContaining({ storageKey: `avatars/${BIA_AVATAR_ID}` }),
    );
  });
});
