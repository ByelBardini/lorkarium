import {
  documentResponseDto,
  documentTabResponseDto,
  documentTabWriteResponseDto,
  documentWriteResponseDto,
  type DocumentContentDto,
  type DocumentDto,
  type DocumentTabDto,
  type DocumentTabSummaryDto,
  type DocumentTabWriteResponseDto,
  type DocumentWriteResponseDto,
} from '@lorkarium/contracts';
import { expect } from 'vitest';
import type { SignedInUser } from './sign-in';
import type { TokenTableHarness } from './token-table';

export class DocumentHttpHarness {
  constructor(readonly live: TokenTableHarness) {}
  url(documentId?: string): string {
    return `/api/campaigns/${this.live.vharn.id}/documents${documentId ? `/${documentId}` : ''}`;
  }
  /** `…/documents/:id/tabs[/:tabId]`; without a tab id, the tab collection. */
  tabUrl(documentId: string, tabId?: string): string {
    return `${this.url(documentId)}/tabs${tabId ? `/${tabId}` : ''}`;
  }
  /** Where the images of the first tab the document lists are prepared. */
  imagesUrl(document: DocumentDto): string {
    return `${this.tabUrl(document.id, firstTabOf(document).id)}/images`;
  }
  async create(changes: Record<string, unknown> = {}): Promise<DocumentDto> {
    const response = await this.live.http(this.live.ana, {
      method: 'POST',
      url: this.url(),
      payload: { actionId: crypto.randomUUID(), ...changes },
    });
    expect(response.statusCode, response.body).toBe(201);
    return documentWriteResponseDto.parse(response.json()).document;
  }
  async read(documentId: string, user: SignedInUser = this.live.ana): Promise<DocumentDto> {
    const response = await this.live.http(user, { method: 'GET', url: this.url(documentId) });
    expect(response.statusCode, response.body).toBe(200);
    return documentResponseDto.parse(response.json()).document;
  }
  async administer(document: DocumentDto, changes: Record<string, unknown>): Promise<DocumentDto> {
    const response = await this.live.http(this.live.ana, {
      method: 'PATCH',
      url: this.url(document.id),
      payload: { actionId: crypto.randomUUID(), expectedVersion: document.version, ...changes },
    });
    expect(response.statusCode, response.body).toBe(200);
    return documentWriteResponseDto.parse(response.json()).document;
  }
  /** Saves `content` into the first tab of `document` and answers the document as `user` reads it. */
  async save(
    document: DocumentDto,
    content: DocumentContentDto,
    user: SignedInUser = this.live.ana,
  ): Promise<DocumentDto> {
    const current = await this.read(document.id, user);
    await this.saveTab(document.id, firstTabOf(current), content, user);
    return this.read(document.id, user);
  }
  async saveTab(
    documentId: string,
    tab: Pick<DocumentTabSummaryDto, 'id' | 'version'>,
    content: DocumentContentDto,
    user: SignedInUser = this.live.ana,
  ): Promise<DocumentTabWriteResponseDto> {
    const response = await this.live.http(user, {
      method: 'PATCH',
      url: `${this.tabUrl(documentId, tab.id)}/content`,
      payload: { actionId: crypto.randomUUID(), expectedVersion: tab.version, content },
    });
    expect(response.statusCode, response.body).toBe(200);
    return documentTabWriteResponseDto.parse(response.json());
  }
  async createTab(
    document: Pick<DocumentDto, 'id' | 'version'>,
    changes: Record<string, unknown> = {},
    user: SignedInUser = this.live.ana,
  ): Promise<DocumentWriteResponseDto> {
    const response = await this.live.http(user, {
      method: 'POST',
      url: this.tabUrl(document.id),
      payload: { actionId: crypto.randomUUID(), expectedVersion: document.version, ...changes },
    });
    expect(response.statusCode, response.body).toBe(201);
    return documentWriteResponseDto.parse(response.json());
  }
  async readTab(
    documentId: string,
    tabId: string,
    user: SignedInUser = this.live.ana,
  ): Promise<DocumentTabDto> {
    const response = await this.live.http(user, {
      method: 'GET',
      url: this.tabUrl(documentId, tabId),
    });
    expect(response.statusCode, response.body).toBe(200);
    return documentTabResponseDto.parse(response.json()).tab;
  }
  /** The body of the first tab `user` sees. */
  async firstTabContent(
    documentId: string,
    user: SignedInUser = this.live.ana,
  ): Promise<DocumentContentDto> {
    const document = await this.read(documentId, user);
    return (await this.readTab(documentId, firstTabOf(document).id, user)).content;
  }
}

export function firstTabOf(document: DocumentDto): DocumentTabSummaryDto {
  const [first] = document.tabs;
  if (!first) throw new Error(`Document ${document.id} lists no tab; expected at least one`);
  return first;
}
export function documentText(text: string): DocumentContentDto {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}
