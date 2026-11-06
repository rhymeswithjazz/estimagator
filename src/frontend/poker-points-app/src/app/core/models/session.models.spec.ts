import { describe, expect, it } from 'vitest';
import { getTableCardBack } from './session.models';

describe('getTableCardBack', () => {
  it.each([
    ['halloween', 'jack-o-lantern'],
    ['thanksgiving', 'harvest-plaid'],
    ['christmas', 'candy-cane'],
  ] as const)('shows the %s back whatever the room picked', (season, back) => {
    expect(getTableCardBack('art-deco', season)).toBe(back);
  });

  it("shows the room's back without a season", () => {
    expect(getTableCardBack('art-deco', null)).toBe('art-deco');
  });
});
