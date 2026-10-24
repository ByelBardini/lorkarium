import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignNotFoundError } from '../../../src/modules/campaigns/campaigns.error';
import { PingsService } from '../../../src/modules/pings/pings.service';
import { SceneNotFoundError } from '../../../src/modules/scenes/scenes.error';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { MembershipReadsFake } from '../../support/campaigns-fakes';
import { BIA_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { GridAudienceFake, PingPublisherFake } from '../../support/pings-fakes';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';

const NOW = new Date('2026-10-24T12:00:00Z');
const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const STRANGER_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';
const ANA_SOCKET = 'socket-ana';
const COMMAND = { actionId: ACTION_ID, campaignId: VHARN_ID, sceneId: VHARN_SCENE_ID };

describe('PingsService', () => {
  let audience: GridAudienceFake;
  let publisher: PingPublisherFake;
  let service: PingsService;

  beforeEach(() => {
    const members = new MembershipReadsFake([
      campaignMemberPo({ userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ userId: BIA_ID, role: 'player' }),
    ]);
    audience = new GridAudienceFake().join(ANA_SOCKET, VHARN_ID, VHARN_SCENE_ID);
    publisher = new PingPublisherFake();
    service = new PingsService({ members, audience, publisher, clock: new ClockFake(NOW) });
  });

  it('a member in the grid room pings it: the event names the session user, not the payload', async () => {
    const forged = { ...COMMAND, x: 3.42, y: 1.5, userId: BIA_ID };

    await service.ping(ANA_ID, VHARN_ID, forged, ANA_SOCKET);

    expect(publisher.sent).toEqual([
      {
        event: {
          campaignId: VHARN_ID,
          sceneId: VHARN_SCENE_ID,
          userId: ANA_ID,
          x: 3.42,
          y: 1.5,
          at: '2026-10-24T12:00:00.000Z',
        },
        exceptConnectionId: ANA_SOCKET,
      },
    ]);
  });

  it('a connection outside the grid room is refused with SCENE_NOT_FOUND and nothing goes out', async () => {
    const ping = service.ping(BIA_ID, VHARN_ID, { ...COMMAND, x: 1, y: 1 }, 'socket-bia');

    await expect(ping).rejects.toBeInstanceOf(SceneNotFoundError);
    expect(publisher.sent).toEqual([]);
  });

  it('someone outside the table gets CAMPAIGN_NOT_FOUND before the room is looked at', async () => {
    audience.join('socket-stranger', VHARN_ID, VHARN_SCENE_ID);

    const ping = service.ping(STRANGER_ID, VHARN_ID, { ...COMMAND, x: 1, y: 1 }, 'socket-stranger');

    await expect(ping).rejects.toBeInstanceOf(CampaignNotFoundError);
    expect(audience.asked).toEqual([]);
    expect(publisher.sent).toEqual([]);
  });

  it('two pings on the same point are two events: nothing is deduplicated or kept', async () => {
    const point = { ...COMMAND, x: 2, y: 2 };

    await service.ping(ANA_ID, VHARN_ID, point, ANA_SOCKET);
    await service.ping(ANA_ID, VHARN_ID, point, ANA_SOCKET);

    expect(publisher.sent.map(({ event }) => [event.x, event.y])).toEqual([
      [2, 2],
      [2, 2],
    ]);
  });
});
