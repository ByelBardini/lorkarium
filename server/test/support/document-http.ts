import {
  documentResponseDto,
  documentWriteResponseDto,
  type DocumentDto,
  type DocumentContentDto,
} from '@lorkarium/contracts';
import { expect } from 'vitest';
import type { SignedInUser } from './sign-in';
import type { TokenTableHarness } from './token-table';

export class DocumentHttpHarness {
  constructor(readonly live: TokenTableHarness) {}
  url(documentId?: string): string {
    return `/api/campaigns/${this.live.vharn.id}/documents${documentId ? `/${documentId}` : ''}`;
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
  async save(
    document: DocumentDto,
    content: DocumentContentDto,
    user: SignedInUser = this.live.ana,
  ): Promise<DocumentDto> {
    const response = await this.live.http(user, {
      method: 'PATCH',
      url: `${this.url(document.id)}/content`,
      payload: { actionId: crypto.randomUUID(), expectedVersion: document.version, content },
    });
    expect(response.statusCode, response.body).toBe(200);
    return documentWriteResponseDto.parse(response.json()).document;
  }
}

export function documentText(text: string): DocumentContentDto {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}
