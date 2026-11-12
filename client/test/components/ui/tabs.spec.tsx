import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function renderTabs(): void {
  render(
    <Tabs defaultValue="a">
      <TabsList aria-label="Seções">
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
      </TabsList>
      <TabsContent value="a">conteúdo A</TabsContent>
      <TabsContent value="b">conteúdo B</TabsContent>
    </Tabs>,
  );
}

describe('TabsTrigger: the focus ring', () => {
  it('a pressed trigger is marked, so the keyboard ring stays off on a click', async () => {
    renderTabs();
    const second = screen.getByRole('tab', { name: 'B' });

    await userEvent.click(second);

    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('data-pointer-focus');
    expect(second.className).toContain('focus-visible:not-data-pointer-focus:outline-2');
  });

  it('the mark goes away when the trigger loses the focus', async () => {
    renderTabs();
    const second = screen.getByRole('tab', { name: 'B' });
    await userEvent.click(second);

    fireEvent.blur(second);

    expect(second).not.toHaveAttribute('data-pointer-focus');
  });

  it('a trigger reached by the arrows has no mark: the ring shows', async () => {
    renderTabs();
    await userEvent.click(screen.getByRole('tab', { name: 'A' }));

    await userEvent.keyboard('{ArrowRight}');

    const second = screen.getByRole('tab', { name: 'B' });
    expect(second).toHaveFocus();
    expect(second).not.toHaveAttribute('data-pointer-focus');
  });

  it('the caller pointer and blur handlers still run', async () => {
    const seen: string[] = [];
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger
            value="a"
            onPointerDown={() => seen.push('pointer')}
            onBlur={() => seen.push('blur')}
          >
            A
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const tab = screen.getByRole('tab', { name: 'A' });
    await userEvent.click(tab);
    fireEvent.blur(tab);
    expect(seen).toEqual(['pointer', 'blur']);
  });
});
