import { describe, expect, it } from 'vitest';
import { getTableCardBack } from './session.models';

describe('getTableCardBack', () => {
  it('shows the Jack-o-Lantern back on the Halloween theme whatever the room picked', () => {
    expect(getTableCardBack('art-deco', true)).toBe('jack-o-lantern');
  });

  it("shows the room's back otherwise", () => {
    expect(getTableCardBack('art-deco', false)).toBe('art-deco');
  });
});
