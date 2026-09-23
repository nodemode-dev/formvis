import { describe, expect, it } from 'vitest';
import { cornerRadiiOf } from '../src/engine';

describe('live corner radii', () => {
  it('reads four good radii and nothing else', () => {
    expect(cornerRadiiOf({ cornerRadii: [0, 10, 20.5, 3] })).toEqual([0, 10, 20.5, 3]);
    for (const bad of [undefined, [1, 2, 3], [1, 2, 3, -1], [1, 2, 3, NaN], [1, 2, '3', 4]]) expect(cornerRadiiOf({ cornerRadii: bad })).toBeNull();
  });
});
