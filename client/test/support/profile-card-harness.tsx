import type { ProfileCardDto } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ProfileCardProvider } from '@/features/profile-card/profile-card-provider';
import { ProfileCardTrigger } from '@/features/profile-card/profile-card-trigger';
import { testDependencies, type TestDependencies } from './app-dependencies';
import { ANA } from './auth-api-fake';
import { ConversationStub } from './conversation-stub';
import { LYRA_CARD } from './profile-card-fixtures';

/** One name that opens the profile card, read by Ana, over `testDependencies()`: the card comes
 *  from `deps.profileCardApi`, the friendship commands from `deps.friendsApi`, and
 *  `/friends/:friendId` renders "Conversa com <id>".
 *
 *  Example: `const harness = new ProfileCardHarness(); await harness.open(lyraCard({ plan: 'free' }))` */
export class ProfileCardHarness {
  readonly deps: TestDependencies = testDependencies();

  render(card: ProfileCardDto = LYRA_CARD): void {
    this.deps.profileCardApi.put(card);
    this.mount(<ProfileCardTrigger userId={card.id} name={card.name} />);
  }

  /** Renders any screen part under the provider and the router (an entry point of the card). */
  mount(element: React.ReactNode): void {
    const provided = (
      <ProfileCardProvider deps={this.deps} viewerId={ANA.id}>
        {element}
      </ProfileCardProvider>
    );
    const router = createMemoryRouter(
      [
        { path: '/', element: provided },
        { path: '/friends/:friendId', element: <ConversationStub /> },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
  }

  /** Renders and clicks the name; resolves with the popover once the card is on it. */
  async open(card: ProfileCardDto = LYRA_CARD): Promise<HTMLElement> {
    this.render(card);
    await userEvent.click(screen.getByRole('button', { name: card.name }));
    const popover = await screen.findByRole('dialog', { name: `Perfil de ${card.name}` });
    await screen.findByText(`@${card.username}`);
    return popover;
  }
}
