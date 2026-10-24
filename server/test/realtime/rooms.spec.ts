import { describe, expect, it } from 'vitest';
import {
  campaignMastersRoom,
  campaignRoom,
  campaignUserRoom,
  isRoomOfCampaign,
  sceneAudienceRooms,
  sceneIdOfRoom,
  sceneMastersRoom,
  sceneRoom,
  sceneUserRoom,
} from '../../src/realtime/rooms';

describe('campaignRoom', () => {
  it('the room of a table is prefixed with campaign:', () => {
    expect(campaignRoom('3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10')).toBe(
      'campaign:3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10',
    );
  });
});

describe('audience rooms', () => {
  const CAMPAIGN = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';
  const USER = '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f';

  it('the room of one user sits under the table room', () => {
    expect(campaignUserRoom(CAMPAIGN, USER)).toBe(`campaign:${CAMPAIGN}:user:${USER}`);
  });

  it('the masters room sits under the table room', () => {
    expect(campaignMastersRoom(CAMPAIGN)).toBe(`campaign:${CAMPAIGN}:masters`);
  });

  it('two users of one table never share a room', () => {
    expect(campaignUserRoom(CAMPAIGN, USER)).not.toBe(campaignUserRoom(CAMPAIGN, CAMPAIGN));
  });
});

describe('grid rooms', () => {
  const CAMPAIGN = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';
  const OTHER = '4c2f0b63-7d5e-4a9b-8f3c-2b8d6e4a9f21';
  const SCENE = '7d3c2b1a-0f9e-4d8c-b7a6-5e4d3c2b1a0f';
  const USER = '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f';

  it('the room of a grid sits under its table room', () => {
    expect(sceneRoom(CAMPAIGN, SCENE)).toBe(`campaign:${CAMPAIGN}:scene:${SCENE}`);
  });

  it('the masters and the user rooms of a grid sit under the grid room', () => {
    expect(sceneMastersRoom(CAMPAIGN, SCENE)).toBe(`campaign:${CAMPAIGN}:scene:${SCENE}:masters`);
    expect(sceneUserRoom(CAMPAIGN, SCENE, USER)).toBe(
      `campaign:${CAMPAIGN}:scene:${SCENE}:user:${USER}`,
    );
  });

  it('a player enters the grid room and their own; a master also the masters room', () => {
    const player = [sceneRoom(CAMPAIGN, SCENE), sceneUserRoom(CAMPAIGN, SCENE, USER)];

    expect(sceneAudienceRooms(CAMPAIGN, SCENE, USER, 'player')).toEqual(player);
    expect(sceneAudienceRooms(CAMPAIGN, SCENE, USER, 'master')).toEqual([
      ...player,
      sceneMastersRoom(CAMPAIGN, SCENE),
    ]);
  });

  it('a spectator enters only the grid room, never their own nor the masters one', () => {
    expect(sceneAudienceRooms(CAMPAIGN, SCENE, USER, 'spectator')).toEqual([
      sceneRoom(CAMPAIGN, SCENE),
    ]);
  });

  it('the table room and every room under it are of the table; another table room is not', () => {
    expect(isRoomOfCampaign(campaignRoom(CAMPAIGN), CAMPAIGN)).toBe(true);
    expect(isRoomOfCampaign(sceneUserRoom(CAMPAIGN, SCENE, USER), CAMPAIGN)).toBe(true);
    expect(isRoomOfCampaign(sceneRoom(OTHER, SCENE), CAMPAIGN)).toBe(false);
    expect(isRoomOfCampaign(`${campaignRoom(CAMPAIGN)}x`, CAMPAIGN)).toBe(false);
  });
});

describe('sceneIdOfRoom', () => {
  const CAMPAIGN = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';
  const OTHER = '5e8d2c1b-4a3f-4b6e-9d7c-2f1a0b9c8d7e';
  const SCENE = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
  const USER = '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f';

  it('the room of a grid of the table gives the id of that grid', () => {
    expect(sceneIdOfRoom(sceneRoom(CAMPAIGN, SCENE), CAMPAIGN)).toBe(SCENE);
  });

  it.each([
    ['the table', campaignRoom(CAMPAIGN)],
    ['a user at the table', campaignUserRoom(CAMPAIGN, USER)],
    ['the masters of a grid', sceneMastersRoom(CAMPAIGN, SCENE)],
    ['a user in a grid', sceneUserRoom(CAMPAIGN, SCENE, USER)],
    ['a grid of another table', sceneRoom(OTHER, SCENE)],
  ])('the room of %s is no grid of the table', (_room, room) => {
    expect(sceneIdOfRoom(room, CAMPAIGN)).toBeUndefined();
  });
});
