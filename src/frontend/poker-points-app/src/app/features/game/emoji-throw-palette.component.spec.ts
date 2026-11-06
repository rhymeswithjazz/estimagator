import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import type { Season } from '../../core/models/season.models';
import { EMOJI_THROW_OPTIONS, getEmojiThrowOptionMetadata } from '../../core/models/session.models';
import { ThemeService } from '../../core/services/theme.service';
import { EmojiThrowPaletteComponent } from './emoji-throw-palette.component';

function renderPalette(season: Season | null) {
  return render(EmojiThrowPaletteComponent, {
    inputs: { targetDisplayName: 'Sam' },
    providers: [{ provide: ThemeService, useValue: { activeSeason: signal(season) } }],
  });
}

describe('EmojiThrowPaletteComponent', () => {
  it('shows only the standard items without a seasonal theme', async () => {
    await renderPalette(null);

    expect(screen.getAllByRole('button')).toHaveLength(EMOJI_THROW_OPTIONS.length);
    expect(screen.queryByRole('button', { name: 'Throw pumpkin at Sam' })).toBeNull();
  });

  it.each([
    ['halloween', ['pumpkin', 'bat', 'spider']],
    ['thanksgiving', ['turkey', 'pie', 'corn']],
    ['christmas', ['snowball', 'gift', 'cookie']],
  ] as const)('adds the %s items', async (season, labels) => {
    await renderPalette(season);

    expect(screen.getAllByRole('button')).toHaveLength(EMOJI_THROW_OPTIONS.length + 3);
    for (const label of labels) {
      expect(screen.getByRole('button', { name: `Throw ${label} at Sam` })).toBeInTheDocument();
    }
  });

  it('knows how to fly seasonal items for players without the theme', () => {
    expect(getEmojiThrowOptionMetadata('🎃')?.profile).toBe('rock');
    expect(getEmojiThrowOptionMetadata('🦃')?.profile).toBe('rock');
    expect(getEmojiThrowOptionMetadata('🎁')?.profile).toBe('rock');
    expect(getEmojiThrowOptionMetadata('\u{1F577}\u{FE0F}')?.label).toBe('spider');
    expect(getEmojiThrowOptionMetadata('\u{2744}\u{FE0F}')?.label).toBe('snowball');
  });
});
