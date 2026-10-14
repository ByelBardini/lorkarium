// Spec propositalmente ruim: cada it abaixo dispara uma regra do driver.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CombatService } from '../../../src/modules/combat/combat.service';

vi.mock('../../../src/modules/combat/combat.service');

const NAMES = ['goblin', 'hero'];

describe('CombatService', () => {
  const findNames = vi.fn();
  let service: CombatService;

  beforeEach(() => {
    service = new CombatService({ findNames: vi.fn() });
  });

  it('works', async () => {
    await service.listNames('combat-1');
  });

  it('the listed names are the names the mock returned', async () => {
    findNames.mockResolvedValue(NAMES);
    await expect(service.listNames('combat-1')).resolves.toEqual(NAMES);
  });

  it('asks the reader when listing', async () => {
    await service.listNames('combat-1');
    expect(findNames).toHaveBeenCalled();
  });

  it('truth stays true forever', () => {
    expect(true).toBe(true);
  });

  it('the list exists after listing', async () => {
    expect(await service.listNames('combat-1')).toBeDefined();
  });

  it('the list exists after listing', async () => {
    expect(await service.listNames('combat-1')).toEqual(['x']);
  });

  it.skip('skipped until the real reader exists', () => {
    expect(1).toBe(2);
  });

  it.only('exclusive test stuck in the file', () => {
    expect(service).toBeInstanceOf(CombatService);
  });

  it('regression of the empty combat list', async () => {
    findNames.mockResolvedValue([]);
    await expect(service.listNames('combat-1')).resolves.toHaveLength(0);
  });

  describe('with nothing inside', () => {});

  it('scenario too long to fit in a single it', () => {
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
    expect(NAMES.length).toBe(2);
  });
});
