import type { UserReportDto } from '@lorkarium/contracts';
import { LYRA_CARD } from './profile-card-fixtures';

/** An open report of Bia against Lyra (Lyra's card is in `ProfileCardApiFake` by default). */
export const SPAM_REPORT: UserReportDto = {
  id: '7a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  reason: 'spam',
  details: 'Manda link de loja no chat da mesa.',
  status: 'open',
  reporter: { id: '2c9e4b1a-7d3f-4a8e-b6c5-0f1e2d3c4b5a', username: 'biaflor' },
  target: { id: LYRA_CARD.id, username: LYRA_CARD.username },
  createdAt: '2026-11-12T10:00:00.000Z',
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
  target: { id: '2c9e4b1a-7d3f-4a8e-b6c5-0f1e2d3c4b5a', username: 'biaflor' },
  createdAt: '2026-11-12T11:00:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
};
