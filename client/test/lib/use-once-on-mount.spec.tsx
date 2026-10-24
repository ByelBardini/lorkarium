import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { useOnceOnMount } from '@/lib/use-once-on-mount';

function Probe({ runs, label }: Readonly<{ runs: string[]; label: string }>): React.JSX.Element {
  useOnceOnMount(() => runs.push(label));
  return <p>{label}</p>;
}

describe('useOnceOnMount', () => {
  it('runs once on mount, even under StrictMode', () => {
    const runs: string[] = [];
    render(
      <StrictMode>
        <Probe runs={runs} label="a" />
      </StrictMode>,
    );
    expect(runs).toEqual(['a']);
  });

  it('a re-render with new props does not run it again', () => {
    const runs: string[] = [];
    const { rerender } = render(<Probe runs={runs} label="a" />);
    rerender(<Probe runs={runs} label="b" />);
    expect(runs).toEqual(['a']);
  });
});
