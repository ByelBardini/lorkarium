import type { ImagePresentationChangedDto } from '@lorkarium/contracts';
import type {
  LibraryImageDaos,
  LibraryImageServiceDeps,
} from '../../src/modules/library/library-image.service';
import type { LibraryImageRow } from '../../src/modules/library/library-images.dao';
import type {
  LibraryImagePo,
  NewLibraryImagePo,
  LibraryImageChangesPo,
} from '../../src/modules/library/library-images.po';
import type { ImagePresentationPo } from '../../src/modules/library/image-presentations.po';
import type { PresentationChange } from '../../src/modules/library/image-presentations.dao';
import { ClockFake } from './auth-fakes';
import { ANA_ID } from './auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from './campaigns-fakes';
import { BIA_ID, VHARN_ID, campaignPo, campaignMemberPo } from './campaigns-factories';
import {
  LibraryCampaignsDaoFake,
  LibraryScenesDaoFake,
  SceneFoldersDaoFake,
} from './library-fakes';
import { AssetsDaoFake } from './assets-fakes';
import { libraryImageRow } from './library-image-factories';
type ImageDao = LibraryImageDaos['images'];
type PresentationDao = LibraryImageDaos['presentations'];
export class LibraryImagesDaoFake implements ImageDao {
  readonly rows: LibraryImageRow[] = [];
  failSave = false;
  constructor(private readonly journal: string[]) {}
  async listOfCampaign(campaignId: string): Promise<LibraryImageRow[]> {
    return this.rows.filter((row) => row.image.campaignId === campaignId);
  }
  async findInCampaign(campaignId: string, imageId: string): Promise<LibraryImageRow | undefined> {
    return this.rows.find((row) => row.image.campaignId === campaignId && row.image.id === imageId);
  }
  async insert(input: NewLibraryImagePo): Promise<LibraryImagePo> {
    if (this.failSave) throw new Error('save failed');
    const fixture = libraryImageRow();
    const image = { ...fixture.image, ...input, id: input.id ?? fixture.image.id };
    this.rows.push({ ...fixture, image });
    this.journal.push('insert');
    return image;
  }
  async update(campaignId: string, imageId: string, changes: LibraryImageChangesPo): Promise<void> {
    const row = await this.findInCampaign(campaignId, imageId);
    if (row) Object.assign(row.image, changes);
    this.journal.push('update');
  }
  async delete(campaignId: string, imageId: string): Promise<void> {
    const index = this.rows.findIndex(
      (row) => row.image.campaignId === campaignId && row.image.id === imageId,
    );
    if (index >= 0) this.rows.splice(index, 1);
    this.journal.push('delete');
  }
  async moveFromFolder(): Promise<void> {}
}
export class ImagePresentationsDaoFake implements PresentationDao {
  row: ImagePresentationPo | undefined;
  failSave = false;
  constructor(private readonly journal: string[]) {}
  async findOfCampaign(campaignId: string): Promise<ImagePresentationPo | undefined> {
    return this.row?.campaignId === campaignId ? this.row : undefined;
  }
  async save(
    campaignId: string,
    change: PresentationChange,
    changedAt: Date,
  ): Promise<ImagePresentationPo> {
    if (this.failSave) throw new Error('save presentation failed');
    this.journal.push('save presentation');
    this.row = {
      campaignId,
      version: (this.row?.version ?? 0) + 1,
      presentationId: change?.presentationId ?? null,
      imageId: change?.imageId ?? null,
      nameAtPresentation: change?.nameAtPresentation ?? null,
      changedAt,
    };
    return this.row;
  }
}
export class LibraryImagesHarness {
  readonly journal: string[] = [];
  readonly images = new LibraryImagesDaoFake(this.journal);
  readonly presentations = new ImagePresentationsDaoFake(this.journal);
  readonly events: ImagePresentationChangedDto[] = [];
  readonly members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
    campaignMemberPo({ userId: ANA_ID, role: 'master', campaignId: VHARN_ID }),
    campaignMemberPo({ userId: BIA_ID, role: 'player', campaignId: VHARN_ID }),
  ]);
  readonly assets = new AssetsDaoFake([], [libraryImageRow().asset]);
  readonly daos: LibraryImageDaos = {
    campaigns: new LibraryCampaignsDaoFake(this.journal, [campaignPo({ id: VHARN_ID })]),
    members: this.members,
    assets: this.assets,
    images: this.images,
    presentations: this.presentations,
    folders: new SceneFoldersDaoFake(this.journal),
    scenes: new LibraryScenesDaoFake(this.journal),
  };
  private nextId = 0;
  readonly deps: LibraryImageServiceDeps = {
    read: this.daos,
    transaction: async (work) => {
      const result = await work(this.daos);
      this.journal.push('commit');
      return result;
    },
    snapshot: (work) => work(this.daos),
    clock: new ClockFake(new Date('2026-10-29T15:00:00Z')),
    newId: () => `presentation-${++this.nextId}`,
    publisher: {
      libraryChanged: () => {
        this.journal.push('publish library');
      },
      imagePresentationChanged: (event) => {
        this.events.push(event);
        this.journal.push('publish presentation');
      },
    },
    maxFolderDepth: 5,
  };
}
