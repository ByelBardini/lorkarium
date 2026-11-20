import type { UserReportDto } from '@lorkarium/contracts';
import { LYRA_CARD } from './profile-card-fixtures';

/** An open report of Bia against Lyra (Lyra's card is in `ProfileCardApiFake` by default). */
export const SPAM_REPORT: UserReportDto = {
  id: '7a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  reason: 'spam',
  details: 'Manda link de loja no chat da mesa.',
  status: 'open',
  reporter: { id: '2c9e4b1a-7d3f-4a8e-b6c5-0f1e2d3c4b5a', username: 'biaflor' },
  target: { id: LYRA_CARD.id, username: LYRA_CARD.username, name: LYRA_CARD.name },
  campaignId: null,
  campaignName: null,
  attachments: [],
  adminNote: null,
  createdAt: '2026-11-12T10:00:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
};

function shot(index: number): UserReportDto['attachments'][number] {
  const id = `4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7${index}`;
  return { id, mimeType: 'image/webp', width: 1280, height: 720, sizeBytes: 90_000 };
}

/** An open report at Vharn with 3 screenshots, whose two accounts were deleted since. */
export const CHEATING_REPORT: UserReportDto = {
  id: '9c3f2e4a-5d6f-4a7b-8c9d-2e3f4a5b6c7d',
  reason: 'cheating',
  details: 'Mexeu nos dados pelo console.',
  status: 'open',
  reporter: { id: null, username: 'ana' },
  target: { id: null, username: 'caio', name: 'Caio' },
  campaignId: '6d7e8f9a-0b1c-4d2e-8f3a-4b5c6d7e8f9a',
  campaignName: 'Os Sinos de Vharn',
  attachments: [shot(1), shot(2), shot(3)],
  adminNote: null,
  createdAt: '2026-11-12T12:00:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
};

/** A second open report, without details, of Caio against Bia. */
export const HARASSMENT_REPORT: UserReportDto = {
  id: '8b2e1d3f-4c5e-4f6a-9b0c-1d2e3f4a5b6c',
  reason: 'harassment',
  details: null,
  status: 'open',
  reporter: { id: '3d0f5c2b-8e4a-4b9f-a7d6-1a2b3c4d5e6f', username: 'caio' },
  target: { id: '2c9e4b1a-7d3f-4a8e-b6c5-0f1e2d3c4b5a', username: 'biaflor', name: 'Bia Flor' },
  campaignId: null,
  campaignName: null,
  attachments: [],
  adminNote: null,
  createdAt: '2026-11-12T11:00:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
};
