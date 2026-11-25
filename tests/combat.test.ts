import { describe, expect, it } from 'vitest';
import { isInsideMeleeArc, normalizedMovement } from '../src/game/rules/combat';

describe('regras de combate', () => {
  it('normaliza movimento diagonal sem alterar movimento cardinal', () => {
    expect(normalizedMovement(0, 0)).toEqual({ x: 0, y: 0 });
    expect(normalizedMovement(1, 0)).toEqual({ x: 1, y: 0 });
    const diagonal = normalizedMovement(1, 1);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
  });

  it('só acerta alvos dentro do alcance e do arco da katana', () => {
    const origin = { x: 10, y: 10 };
    expect(isInsideMeleeArc(origin, { x: 50, y: 10 }, 0, 50, Math.PI / 4)).toBe(true);
    expect(isInsideMeleeArc(origin, { x: 80, y: 10 }, 0, 50, Math.PI / 4)).toBe(false);
    expect(isInsideMeleeArc(origin, { x: 30, y: 50 }, 0, 50, Math.PI / 4)).toBe(false);
  });
});
