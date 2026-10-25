import { describe, expect, it } from 'vitest';
import { PixiAuraAnimator, type AnimatedAura } from '@/renderer/pixi-aura-animator';
import { AnimatedAuraFake } from '../support/animated-aura-fake';

const SCREEN = { x: 0, y: 0, width: 800, height: 600 };
const PLAYING = () => ({ visible: SCREEN, playing: true });
const STILL = () => ({ visible: SCREEN, playing: false });

function animatorWith(...auras: AnimatedAura[]) {
  const set = new Set(auras);
  return new PixiAuraAnimator(() => set);
}

describe('PixiAuraAnimator', () => {
  it('without animated auras, a frame steps nothing and asks for no render', () => {
    expect(animatorWith().animate(0, PLAYING)).toBe(false);
  });

  it('without animated auras, the frame is never even asked (no media query per frame)', () => {
    let asked = 0;
    animatorWith().animate(0, () => {
      asked += 1;
      return PLAYING();
    });
    expect(asked).toBe(0);
  });

  it('two frames 20 ms apart step only the first: at most 30 per second', () => {
    const torch = new AnimatedAuraFake({ x: 0, y: 0, width: 64, height: 64 });
    const animator = animatorWith(torch);

    expect([animator.animate(1000, PLAYING), animator.animate(1020, PLAYING)]).toEqual([
      true,
      false,
    ]);
    expect(torch.ticks).toHaveLength(1);
  });

  it('the clock of the auras is the time played: 40 ms after the first step it is 0.04 s', () => {
    const torch = new AnimatedAuraFake({ x: 0, y: 0, width: 64, height: 64 });
    const animator = animatorWith(torch);

    animator.animate(1000, PLAYING);
    animator.animate(1040, PLAYING);

    expect(torch.ticks).toEqual([0, 0.04]);
  });

  it('an aura off screen does not step; one on screen does', () => {
    const away = new AnimatedAuraFake({ x: 2000, y: 0, width: 64, height: 64 });
    const near = new AnimatedAuraFake({ x: 0, y: 0, width: 64, height: 64 });

    animatorWith(away, near).animate(0, PLAYING);

    expect([away.ticks, near.ticks]).toEqual([[], [0]]);
  });

  it('only auras off screen ask for no render', () => {
    const away = new AnimatedAuraFake({ x: 2000, y: 0, width: 64, height: 64 });
    expect(animatorWith(away).animate(0, PLAYING)).toBe(false);
  });

  it('stilled, it never steps', () => {
    const torch = new AnimatedAuraFake({ x: 0, y: 0, width: 64, height: 64 });
    const animator = animatorWith(torch);

    expect([animator.animate(0, STILL), animator.animate(100, STILL)]).toEqual([false, false]);
    expect(torch.ticks).toEqual([]);
  });

  it('played again after a pause, it goes on from the frame where it stopped', () => {
    const torch = new AnimatedAuraFake({ x: 0, y: 0, width: 64, height: 64 });
    const animator = animatorWith(torch);
    animator.animate(1000, PLAYING);
    animator.animate(1050, PLAYING);
    animator.animate(1100, STILL);
    animator.animate(5000, STILL);

    animator.animate(9000, PLAYING);
    animator.animate(9040, PLAYING);

    expect(torch.ticks).toEqual([0, 0.05, 0.05, 0.09]);
  });
});
