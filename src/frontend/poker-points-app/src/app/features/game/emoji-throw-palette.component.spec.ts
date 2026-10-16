import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import { EMOJI_THROW_OPTIONS, getEmojiThrowOptionMetadata } from '../../core/models/session.models';
import { ThemeService } from '../../core/services/theme.service';
import { EmojiThrowPaletteComponent } from './emoji-throw-palette.component';

function renderPalette(halloween: boolean) {
  return render(EmojiThrowPaletteComponent, {
    inputs: { targetDisplayName: 'Sam' },
    providers: [{ provide: ThemeService, useValue: { isHalloween: signal(halloween) } }],
  });
}

describe('EmojiThrowPaletteComponent', () => {
  it('shows only the standard items without the Halloween theme', async () => {
    await renderPalette(false);

    expect(screen.getAllByRole('button')).toHaveLength(EMOJI_THROW_OPTIONS.length);
    expect(screen.queryByRole('button', { name: 'Throw pumpkin at Sam' })).toBeNull();
  });

  it('adds pumpkin, bat and spider with the Halloween theme', async () => {
    await renderPalette(true);

    for (const label of ['pumpkin', 'bat', 'spider']) {
      expect(screen.getByRole('button', { name: `Throw ${label} at Sam` })).toBeInTheDocument();
    }
  });

  it('knows how to fly Halloween items for players without the theme', () => {
    expect(getEmojiThrowOptionMetadata('🎃')?.profile).toBe('rock');
    expect(getEmojiThrowOptionMetadata('🦇')?.profile).toBe('default');
    expect(getEmojiThrowOptionMetadata('\u{1F577}\u{FE0F}')?.label).toBe('spider');
  });
});
