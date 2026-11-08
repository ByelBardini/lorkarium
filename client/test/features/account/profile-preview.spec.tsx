import type { MemberColorDto } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfilePreview } from '@/features/account/profile-preview';

function pingOf(color: MemberColorDto): SVGSVGElement {
  const { container } = render(
    <ProfilePreview
      name="Ana"
      username="ana"
      color={color}
      avatarId={null}
      bio=""
      memberSince="2026-10-01T00:00:00.000Z"
    />,
  );
  const ping = container.querySelector('svg');
  if (ping === null) throw new Error('the preview has no <svg>: expected the ping illustration');
  return ping;
}

describe('ProfilePreview', () => {
  it('a custom color paints the initials and the ping', () => {
    const ping = pingOf('#336699');

    expect(screen.getByTestId('avatar-initials')).toHaveStyle({ backgroundColor: '#336699' });
    expect(ping.querySelector('circle')).toHaveAttribute('stroke', '#336699');
    expect(ping.querySelector('rect')).toHaveAttribute('fill', '#336699');
  });

  it('the name on a dark custom plate takes the light ink', () => {
    expect(pingOf('#101010').querySelector('text')).toHaveAttribute('fill', '#ffffff');
  });

  it('the name on a plate of the palette keeps the dark ink', () => {
    expect(pingOf('gold').querySelector('text')).toHaveAttribute('fill', '#0c0e11');
  });
});
