import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { RoomContexts } from '@/features/board/room-contexts';
import { SightBlockerSection } from '@/features/tokens/sight-blocker-section';
import { createSightOutlineStore } from '@/stores/sight-outline-store';
import { AssetOutlineApiFake } from '../../support/asset-outline-api-fake';
import { onTablePlan } from '../../support/table-plan';

const STATUE_IMAGE = '11112222-3333-4444-8555-666677778888';
const OLD_IMAGE_NOTICE =
  'Imagem enviada antes deste recurso: bloqueia pelo retângulo. Envie de novo para usar o recorte.';
const ROUND_NOTICE = 'Com borda redonda, bloqueia pelo disco.';
const NO_KEYS = { create: false, delete: false };
const TRIANGLE = [
  [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
] as const;

type RoomSectionProps = Readonly<{
  api: AssetOutlineApiFake;
  on?: boolean;
  imageAssetId?: string | null;
  frame?: 'square' | 'round';
  refusal?: string | null;
}>;

function RoomSection({ api, ...props }: RoomSectionProps) {
  const [outlines] = useState(() => createSightOutlineStore(api));
  const [on, setOn] = useState(props.on ?? true);
  return (
    <RoomContexts players={[]} tokenKeys={NO_KEYS} sightOutlines={outlines}>
      <SightBlockerSection
        on={on}
        onSwitch={setOn}
        imageAssetId={props.imageAssetId ?? null}
        frame={props.frame ?? 'square'}
        refusal={props.refusal ?? null}
      />
    </RoomContexts>
  );
}

async function renderSettled(props: RoomSectionProps): Promise<void> {
  render(<RoomSection {...props} />);
  await act(() => Promise.resolve());
}

describe('SightBlockerSection, the notice', () => {
  it('an image with no outline warns of the rectangle', async () => {
    const api = new AssetOutlineApiFake();

    await renderSettled({ api, imageAssetId: STATUE_IMAGE });

    expect(api.asked).toEqual([STATUE_IMAGE]);
    expect(screen.getByText(OLD_IMAGE_NOTICE)).toBeInTheDocument();
  });

  it('a failed request reads as no outline, and warns too', async () => {
    const api = new AssetOutlineApiFake();
    api.failFor(STATUE_IMAGE, { kind: 'not_found' });

    await renderSettled({ api, imageAssetId: STATUE_IMAGE });

    expect(screen.getByText(OLD_IMAGE_NOTICE)).toBeInTheDocument();
  });

  it('an image with an outline gives no warning', async () => {
    const api = new AssetOutlineApiFake();
    api.answer(STATUE_IMAGE, TRIANGLE);

    await renderSettled({ api, imageAssetId: STATUE_IMAGE });

    expect(api.asked).toEqual([STATUE_IMAGE]);
    expect(screen.queryByText(OLD_IMAGE_NOTICE)).not.toBeInTheDocument();
  });

  it('a wholly transparent image, outline [], gives no warning: it was traced', async () => {
    const api = new AssetOutlineApiFake();
    api.answer(STATUE_IMAGE, []);

    await renderSettled({ api, imageAssetId: STATUE_IMAGE });

    expect(api.asked).toEqual([STATUE_IMAGE]);
    expect(screen.queryByText(OLD_IMAGE_NOTICE)).not.toBeInTheDocument();
  });

  it('while the outline is on its way there is no warning', async () => {
    const api = new AssetOutlineApiFake();
    api.hold();

    await renderSettled({ api, imageAssetId: STATUE_IMAGE });

    expect(api.asked).toEqual([STATUE_IMAGE]);
    expect(screen.queryByText(OLD_IMAGE_NOTICE)).not.toBeInTheDocument();
  });

  it('switched off, the old image neither asks nor warns', async () => {
    const api = new AssetOutlineApiFake();

    await renderSettled({ api, on: false, imageAssetId: STATUE_IMAGE });

    expect(api.asked).toEqual([]);
    expect(screen.queryByText(OLD_IMAGE_NOTICE)).not.toBeInTheDocument();
  });

  it('no image neither asks nor warns', async () => {
    const api = new AssetOutlineApiFake();

    await renderSettled({ api });

    expect(api.asked).toEqual([]);
    expect(screen.queryByText(OLD_IMAGE_NOTICE)).not.toBeInTheDocument();
  });

  it('the round frame says the disc over an old image, without asking its outline', async () => {
    const api = new AssetOutlineApiFake();

    await renderSettled({ api, frame: 'round', imageAssetId: STATUE_IMAGE });

    expect(screen.getByText(ROUND_NOTICE)).toBeInTheDocument();
    expect(screen.queryByText(OLD_IMAGE_NOTICE)).not.toBeInTheDocument();
    expect(api.asked).toEqual([]);
  });

  it('the round frame with no image says the disc too', async () => {
    await renderSettled({ api: new AssetOutlineApiFake(), frame: 'round' });

    expect(screen.getByText(ROUND_NOTICE)).toBeInTheDocument();
  });

  it('switched off, the round frame says nothing', async () => {
    await renderSettled({ api: new AssetOutlineApiFake(), on: false, frame: 'round' });

    expect(screen.queryByText(ROUND_NOTICE)).not.toBeInTheDocument();
  });
});

describe('SightBlockerSection, the refusal', () => {
  it('shows in the group while the switch is on', async () => {
    await renderSettled({ api: new AssetOutlineApiFake(), refusal: 'A cena já tem o máximo.' });

    const group = screen.getByRole('group', { name: 'Bloqueia a visão' });
    expect(within(group).getByRole('alert')).toHaveTextContent('A cena já tem o máximo.');
  });

  it('goes away with the switch off', async () => {
    await renderSettled({ api: new AssetOutlineApiFake(), refusal: 'A cena já tem o máximo.' });

    await userEvent.click(screen.getByRole('switch', { name: 'Bloqueia a visão' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('with no refusal, there is no alert', async () => {
    await renderSettled({ api: new AssetOutlineApiFake() });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SightBlockerSection on a free table (no blocker in the plan)', () => {
  const blockerSwitch = () => screen.getByRole('switch', { name: 'Bloqueia a visão' });

  it('the switch is off and says where the blocker is', async () => {
    render(
      onTablePlan(PLAN_LIMITS.free, <RoomSection api={new AssetOutlineApiFake()} on={false} />),
    );
    await act(() => Promise.resolve());

    expect(blockerSwitch()).toBeDisabled();
    expect(blockerSwitch()).toHaveAccessibleDescription('Disponível no Narrador');
  });

  it('a blocker kept from a paid plan can still be switched off', async () => {
    render(onTablePlan(PLAN_LIMITS.free, <RoomSection api={new AssetOutlineApiFake()} on />));
    await act(() => Promise.resolve());

    expect(blockerSwitch()).toBeEnabled();
    await userEvent.click(blockerSwitch());
    expect(blockerSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('a Narrador table offers the switch', async () => {
    render(
      onTablePlan(PLAN_LIMITS.narrador, <RoomSection api={new AssetOutlineApiFake()} on={false} />),
    );
    await act(() => Promise.resolve());

    expect(blockerSwitch()).toBeEnabled();
  });
});
