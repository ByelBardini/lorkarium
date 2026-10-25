import { describe, expect, it } from 'vitest';
import {
  CONDITION_COLORS,
  CONDITION_DESCRIPTION_MAX_LENGTH,
  CONDITION_ROUNDS_MAX,
  CONDITION_STACKS_MAX,
  setConditionStacksCommandDto,
  applyConditionCommandDto,
  conditionDefinitionDto,
  conditionUsageAckDto,
  conditionUsageCommandDto,
  deleteConditionDefinitionCommandDto,
  restoreDefaultConditionsCommandDto,
  updateConditionDefinitionCommandDto,
  activeConditionDto,
  applyConditionsCommandDto,
  conditionsAppliedDto,
  defineConditionCommandDto,
  setConditionRoundsCommandDto,
} from '../../src/board/condition.dto';

const GRID_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const BASE = {
  actionId: '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a',
  campaignId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a',
};
const TOKEN_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const CONDITION_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const KAEL_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';

describe('defineConditionCommandDto', () => {
  it('a name padded with spaces is trimmed', () => {
    const parsed = defineConditionCommandDto.parse({
      ...BASE,
      name: '  Sangrando ',
      tone: 'harm',
      icon: 'skull',
    });
    expect(parsed.name).toBe('Sangrando');
  });

  it.each(['S', 'x'.repeat(32)])('a name of %s characters passes', (name) => {
    expect(
      defineConditionCommandDto.safeParse({ ...BASE, name, tone: 'harm', icon: 'skull' }).success,
    ).toBe(true);
  });

  it.each(['', '   ', 'x'.repeat(33)])('the name "%s" is refused', (name) => {
    expect(
      defineConditionCommandDto.safeParse({ ...BASE, name, tone: 'harm', icon: 'skull' }).success,
    ).toBe(false);
  });

  it('a command without a look defines one that only shows as an icon (look null)', () => {
    const parsed = defineConditionCommandDto.parse({
      ...BASE,
      name: 'X',
      tone: 'harm',
      icon: 'skull',
    });
    expect(parsed.look).toBeNull();
  });

  it('the invisible look is accepted and a look outside the list is refused', () => {
    const command = { ...BASE, name: 'Sumido', tone: 'benefit', icon: 'ghost' };
    expect(defineConditionCommandDto.parse({ ...command, look: 'invisible' }).look).toBe(
      'invisible',
    );
    expect(defineConditionCommandDto.safeParse({ ...command, look: 'prone' }).success).toBe(false);
  });

  it('the incapacitating tone is accepted', () => {
    const command = { ...BASE, name: 'Paralisado', tone: 'incapacitating', icon: 'lock' };
    expect(defineConditionCommandDto.parse(command).tone).toBe('incapacitating');
  });

  it('a tone other than benefit, harm or incapacitating is refused', () => {
    expect(
      defineConditionCommandDto.safeParse({ ...BASE, name: 'X', tone: 'meh', icon: 'skull' })
        .success,
    ).toBe(false);
  });

  it('an icon outside the closed list is refused', () => {
    const command = { ...BASE, name: 'X', tone: 'harm', icon: '<svg onload=x>' };
    expect(defineConditionCommandDto.safeParse(command).success).toBe(false);
  });

  it('a command without an icon is refused', () => {
    expect(defineConditionCommandDto.safeParse({ ...BASE, name: 'X', tone: 'harm' }).success).toBe(
      false,
    );
  });
});

describe('activeConditionDto', () => {
  const active = {
    id: CONDITION_ID,
    conditionId: CONDITION_ID,
    name: 'Invisível',
    tone: 'benefit',
    icon: 'ghost',
    color: null,
    description: '',
    maxStacks: null,
    imageAssetId: null,
    stacks: 1,
    remainingRounds: null,
  };

  it('a condition on a token carries its look, and one without the field is refused (strict)', () => {
    expect(activeConditionDto.safeParse({ ...active, look: 'invisible' }).success).toBe(true);
    expect(activeConditionDto.safeParse(active).success).toBe(false);
  });
});

describe('applyConditionCommandDto', () => {
  const apply = { ...BASE, tokenId: TOKEN_ID, conditionId: CONDITION_ID };

  it('0 rounds (no limit) is accepted', () => {
    expect(applyConditionCommandDto.parse({ ...apply, rounds: 0 }).rounds).toBe(0);
  });

  it(`${CONDITION_ROUNDS_MAX} rounds pass and one more is refused`, () => {
    expect(applyConditionCommandDto.safeParse({ ...apply, rounds: 99 }).success).toBe(true);
    expect(applyConditionCommandDto.safeParse({ ...apply, rounds: 100 }).success).toBe(false);
  });

  it.each([-1, 1.5])('%s rounds is refused', (rounds) => {
    expect(applyConditionCommandDto.safeParse({ ...apply, rounds }).success).toBe(false);
  });
});

describe('applyConditionsCommandDto', () => {
  const applyMany = { ...BASE, conditionId: CONDITION_ID, rounds: 2 };

  it('two distinct tokens pass', () => {
    const parsed = applyConditionsCommandDto.parse({ ...applyMany, tokenIds: [TOKEN_ID, KAEL_ID] });
    expect(parsed.tokenIds).toEqual([TOKEN_ID, KAEL_ID]);
  });

  it('no token at all is refused', () => {
    expect(applyConditionsCommandDto.safeParse({ ...applyMany, tokenIds: [] }).success).toBe(false);
  });

  it('the same token twice is refused, naming it', () => {
    const parsed = applyConditionsCommandDto.safeParse({
      ...applyMany,
      tokenIds: [TOKEN_ID, TOKEN_ID],
    });
    expect(parsed.error?.issues[0]?.message).toContain(TOKEN_ID);
  });

  it(`${CONDITION_ROUNDS_MAX + 1} rounds is refused`, () => {
    const tooLong = { ...applyMany, tokenIds: [TOKEN_ID], rounds: CONDITION_ROUNDS_MAX + 1 };
    expect(applyConditionsCommandDto.safeParse(tooLong).success).toBe(false);
  });
});

describe('conditionsAppliedDto', () => {
  it('carries the condition each token got, in one version', () => {
    const condition = {
      id: '7f6e5d4c-3b2a-4f1e-8d0c-9b8a7f6e5d4c',
      conditionId: CONDITION_ID,
      name: 'Caído',
      tone: 'harm',
      icon: 'arrow-down-to-line',
      look: null,
      color: null,
      description: 'Deitado no chão.',
      maxStacks: null,
      imageAssetId: null,
      stacks: 1,
      remainingRounds: null,
    };
    const event = {
      campaignId: BASE.campaignId,
      sceneId: GRID_ID,
      version: 4,
      at: '2026-10-16T12:00:00.000Z',
    };
    const parsed = conditionsAppliedDto.parse({
      ...event,
      applied: [{ tokenId: TOKEN_ID, condition }],
    });
    expect(parsed.applied[0]?.condition.name).toBe('Caído');
  });
});

describe('setConditionRoundsCommandDto', () => {
  const command = { ...BASE, tokenId: TOKEN_ID, activeConditionId: CONDITION_ID };

  it.each([0, CONDITION_ROUNDS_MAX])('%i rounds are accepted', (rounds) => {
    expect(setConditionRoundsCommandDto.parse({ ...command, rounds }).rounds).toBe(rounds);
  });

  it.each([CONDITION_ROUNDS_MAX + 1, -1, 1.5])('%s rounds are refused', (rounds) => {
    expect(setConditionRoundsCommandDto.safeParse({ ...command, rounds }).success).toBe(false);
  });

  it('a forged userId is refused', () => {
    const forged = { ...command, rounds: 2, userId: KAEL_ID };

    expect(setConditionRoundsCommandDto.safeParse(forged).success).toBe(false);
  });

  it('an activeConditionId that is not a uuid is refused', () => {
    const result = setConditionRoundsCommandDto.safeParse({
      ...command,
      activeConditionId: 'envenenado',
      rounds: 2,
    });

    expect(result.success).toBe(false);
  });
});

describe('the description of a condition', () => {
  const define = { ...BASE, name: 'Atordoado', tone: 'incapacitating', icon: 'zap' };

  it('a define command without a description defines one with an empty description', () => {
    expect(defineConditionCommandDto.parse(define).description).toBe('');
  });

  it('a description padded with spaces is trimmed', () => {
    const parsed = defineConditionCommandDto.parse({ ...define, description: '  Não age.  ' });
    expect(parsed.description).toBe('Não age.');
  });

  it(`a description of ${CONDITION_DESCRIPTION_MAX_LENGTH} characters passes and one more is refused`, () => {
    const longest = 'x'.repeat(500);
    expect(defineConditionCommandDto.safeParse({ ...define, description: longest }).success).toBe(
      true,
    );
    const tooLong = { ...define, description: `${longest}x` };
    expect(defineConditionCommandDto.safeParse(tooLong).success).toBe(false);
  });

  it('a definition without the description field is refused (strict)', () => {
    const definition = {
      id: CONDITION_ID,
      name: 'Cego',
      tone: 'harm',
      icon: 'eye-off',
      look: null,
    };
    expect(conditionDefinitionDto.safeParse(definition).success).toBe(false);
    const whole = {
      ...definition,
      color: null,
      description: '',
      maxStacks: null,
      imageAssetId: null,
    };
    expect(conditionDefinitionDto.parse(whole).description).toBe('');
  });
});

describe('updateConditionDefinitionCommandDto', () => {
  const update = {
    ...BASE,
    conditionId: CONDITION_ID,
    name: ' Envenenada ',
    tone: 'harm',
    icon: 'flask-conical',
    look: null,
    color: null,
    description: ' Desvantagem em ataques. ',
    maxStacks: null,
    imageAssetId: null,
  };

  it('a whole definition is accepted, name and description trimmed', () => {
    const parsed = updateConditionDefinitionCommandDto.parse(update);
    expect(parsed).toMatchObject({ name: 'Envenenada', description: 'Desvantagem em ataques.' });
  });

  it('an update without the description is refused: it replaces the whole definition', () => {
    const withoutDescription: Partial<typeof update> = { ...update };
    delete withoutDescription.description;
    expect(updateConditionDefinitionCommandDto.safeParse(withoutDescription).success).toBe(false);
  });

  it('a name that is empty once trimmed is refused', () => {
    expect(updateConditionDefinitionCommandDto.safeParse({ ...update, name: '   ' }).success).toBe(
      false,
    );
  });

  it(`a description of ${CONDITION_DESCRIPTION_MAX_LENGTH + 1} characters is refused`, () => {
    const tooLong = { ...update, description: 'x'.repeat(501) };
    expect(updateConditionDefinitionCommandDto.safeParse(tooLong).success).toBe(false);
  });

  it('a conditionId that is not a uuid is refused', () => {
    const named = { ...update, conditionId: 'envenenado' };
    expect(updateConditionDefinitionCommandDto.safeParse(named).success).toBe(false);
  });

  it('a forged userId is refused', () => {
    const forged = { ...update, userId: KAEL_ID };
    expect(updateConditionDefinitionCommandDto.safeParse(forged).success).toBe(false);
  });
});

describe.each([
  ['deleteConditionDefinitionCommandDto', deleteConditionDefinitionCommandDto],
  ['conditionUsageCommandDto', conditionUsageCommandDto],
])('%s', (_name, dto) => {
  it('names the condition by its id', () => {
    expect(dto.parse({ ...BASE, conditionId: CONDITION_ID }).conditionId).toBe(CONDITION_ID);
  });

  it('a conditionId that is not a uuid is refused', () => {
    expect(dto.safeParse({ ...BASE, conditionId: 'cego' }).success).toBe(false);
  });

  it('a forged userId is refused', () => {
    const forged = { ...BASE, conditionId: CONDITION_ID, userId: KAEL_ID };
    expect(dto.safeParse(forged).success).toBe(false);
  });
});

describe('restoreDefaultConditionsCommandDto', () => {
  it('takes only the envelope', () => {
    expect(restoreDefaultConditionsCommandDto.parse(BASE)).toEqual(BASE);
  });

  it('a list of names to restore is refused: the server knows the default list', () => {
    const named = { ...BASE, names: ['Cego'] };
    expect(restoreDefaultConditionsCommandDto.safeParse(named).success).toBe(false);
  });
});

describe('conditionUsageAckDto', () => {
  it('answers how many tokens hold the condition', () => {
    expect(conditionUsageAckDto.parse({ ok: true, tokens: 3 })).toEqual({ ok: true, tokens: 3 });
  });

  it.each([-1, 1.5])('a count of %s tokens is refused', (tokens) => {
    expect(conditionUsageAckDto.safeParse({ ok: true, tokens }).success).toBe(false);
  });
});

describe('the stacks of a condition', () => {
  const define = { ...BASE, name: 'Sangrando', tone: 'harm', icon: 'droplet' };
  const active = {
    id: CONDITION_ID,
    conditionId: CONDITION_ID,
    name: 'Sangrando',
    tone: 'harm',
    icon: 'droplet',
    look: null,
    color: null,
    description: '',
    maxStacks: 5,
    imageAssetId: null,
    remainingRounds: 3,
  };

  it('a define command without maxStacks defines a condition that does not stack', () => {
    expect(defineConditionCommandDto.parse(define).maxStacks).toBeNull();
  });

  it.each([2, CONDITION_STACKS_MAX])('a maximum of %i stacks is accepted', (maxStacks) => {
    expect(defineConditionCommandDto.parse({ ...define, maxStacks }).maxStacks).toBe(maxStacks);
  });

  it.each([1, CONDITION_STACKS_MAX + 1, 2.5])('a maximum of %s stacks is refused', (maxStacks) => {
    expect(defineConditionCommandDto.safeParse({ ...define, maxStacks }).success).toBe(false);
  });

  it('an update without maxStacks is refused: it replaces the whole definition', () => {
    const update = {
      ...define,
      conditionId: CONDITION_ID,
      look: null,
      color: null,
      description: '',
      imageAssetId: null,
    };
    expect(updateConditionDefinitionCommandDto.safeParse(update).success).toBe(false);
    expect(updateConditionDefinitionCommandDto.parse({ ...update, maxStacks: 6 }).maxStacks).toBe(
      6,
    );
  });

  it.each([1, CONDITION_STACKS_MAX])('an active condition with %i stacks is accepted', (stacks) => {
    expect(activeConditionDto.parse({ ...active, stacks }).stacks).toBe(stacks);
  });

  it.each([0, CONDITION_STACKS_MAX + 1])(
    'an active condition with %i stacks is refused',
    (stacks) => {
      expect(activeConditionDto.safeParse({ ...active, stacks }).success).toBe(false);
    },
  );

  it('an active condition without stacks is refused (strict)', () => {
    expect(activeConditionDto.safeParse(active).success).toBe(false);
  });
});

describe('setConditionStacksCommandDto', () => {
  const command = { ...BASE, tokenId: TOKEN_ID, activeConditionId: CONDITION_ID };

  it.each([1, CONDITION_STACKS_MAX])('%i stacks are accepted', (stacks) => {
    expect(setConditionStacksCommandDto.parse({ ...command, stacks }).stacks).toBe(stacks);
  });

  it.each([0, CONDITION_STACKS_MAX + 1, 1.5])('%s stacks are refused', (stacks) => {
    expect(setConditionStacksCommandDto.safeParse({ ...command, stacks }).success).toBe(false);
  });

  it('a forged userId is refused', () => {
    const forged = { ...command, stacks: 2, userId: KAEL_ID };
    expect(setConditionStacksCommandDto.safeParse(forged).success).toBe(false);
  });
});

describe('the color of a condition', () => {
  const define = { ...BASE, name: 'Queimando', tone: 'harm', icon: 'flame' };

  it('a define command without a color defines one painted by its tone (null)', () => {
    expect(defineConditionCommandDto.parse(define).color).toBeNull();
  });

  it.each(CONDITION_COLORS)('the color %s of the palette is accepted', (color) => {
    expect(defineConditionCommandDto.parse({ ...define, color }).color).toBe(color);
  });

  it.each(['#ff0000', 'red', ''])('a color outside the palette (%s) is refused', (color) => {
    expect(defineConditionCommandDto.safeParse({ ...define, color }).success).toBe(false);
  });

  it('an update without the color is refused: it replaces the whole definition', () => {
    const update = {
      ...define,
      conditionId: CONDITION_ID,
      look: null,
      description: '',
      maxStacks: null,
      imageAssetId: null,
    };
    expect(updateConditionDefinitionCommandDto.safeParse(update).success).toBe(false);
    const painted = updateConditionDefinitionCommandDto.parse({ ...update, color: 'ember' });
    expect(painted.color).toBe('ember');
  });
});

describe('the image of a condition', () => {
  const IMAGE_ID = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
  const define = { ...BASE, name: 'Queimando', tone: 'harm', icon: 'flame' };
  const update = {
    ...define,
    conditionId: CONDITION_ID,
    look: null,
    color: null,
    description: '',
    maxStacks: null,
  };
  const definition = {
    id: CONDITION_ID,
    name: 'Queimando',
    tone: 'harm',
    icon: 'flame',
    look: null,
    color: null,
    description: '',
    maxStacks: null,
  };
  const active = {
    ...definition,
    conditionId: CONDITION_ID,
    stacks: 1,
    remainingRounds: null,
  };

  it('a define command without an image defines one shown by its icon (imageAssetId null)', () => {
    expect(defineConditionCommandDto.parse(define).imageAssetId).toBeNull();
  });

  it('a define command with an image asset id keeps it', () => {
    const parsed = defineConditionCommandDto.parse({ ...define, imageAssetId: IMAGE_ID });
    expect(parsed.imageAssetId).toBe(IMAGE_ID);
  });

  it('an update with imageAssetId null (back to the icon) is accepted', () => {
    const parsed = updateConditionDefinitionCommandDto.parse({ ...update, imageAssetId: null });
    expect(parsed.imageAssetId).toBeNull();
  });

  it('an update without the imageAssetId is refused: it replaces the whole definition', () => {
    expect(updateConditionDefinitionCommandDto.safeParse(update).success).toBe(false);
  });

  it('an imageAssetId that is not a uuid (x.png) is refused', () => {
    const named = { ...define, imageAssetId: 'x.png' };
    expect(defineConditionCommandDto.safeParse(named).success).toBe(false);
    const updated = { ...update, imageAssetId: 'x.png' };
    expect(updateConditionDefinitionCommandDto.safeParse(updated).success).toBe(false);
  });

  it('a definition without the imageAssetId field is refused (strict) and one with it passes', () => {
    expect(conditionDefinitionDto.safeParse(definition).success).toBe(false);
    const pictured = conditionDefinitionDto.parse({ ...definition, imageAssetId: IMAGE_ID });
    expect(pictured.imageAssetId).toBe(IMAGE_ID);
  });

  it('an active condition without the imageAssetId field is refused (strict) and one with it passes', () => {
    expect(activeConditionDto.safeParse(active).success).toBe(false);
    const pictured = activeConditionDto.parse({ ...active, imageAssetId: IMAGE_ID });
    expect(pictured.imageAssetId).toBe(IMAGE_ID);
  });
});
