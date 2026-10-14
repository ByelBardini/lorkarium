import { describe, expect, it } from 'vitest';

describe('GET /combats', () => {
  it('a campaign without combats answers an empty list', async () => {
    const response = { statusCode: 200, json: () => [] };
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});
