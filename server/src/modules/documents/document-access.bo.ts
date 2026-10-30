import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { DocumentNotFoundError, DocumentVersionConflictError } from './documents.error';

export type DocumentAccessState = Readonly<{
  id: string;
  visibility: 'public' | 'private';
  ownerIds: readonly string[];
  version: number;
}>;

export class DocumentAccessBo {
  constructor(
    private readonly access: CampaignAccessBo,
    private readonly document: DocumentAccessState,
  ) {}
  canRead(): boolean {
    return this.document.visibility === 'public' || this.canEdit();
  }
  canEdit(): boolean {
    return (
      this.access.isMaster() ||
      (this.access.requireViewer() === 'player' &&
        this.document.ownerIds.includes(this.access.userIdOf()))
    );
  }
  canManage(): boolean {
    return this.access.isMaster();
  }
  requireRead(): void {
    if (!this.canRead())
      throw new DocumentNotFoundError(this.access.campaignIdOf(), this.document.id);
  }
  requireEdit(): void {
    this.requireRead();
    if (!this.canEdit())
      this.access.forbid(
        `edit document ${this.document.id}`,
        'the master role or document ownership',
      );
  }
  requireManage(): void {
    this.requireRead();
    this.access.requireMaster(`manage document ${this.document.id}`);
  }
  requireVersion(expected: number): void {
    if (expected !== this.document.version)
      throw new DocumentVersionConflictError(this.document.id, expected, this.document.version);
  }
}
