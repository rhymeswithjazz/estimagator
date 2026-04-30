import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import {
  EMOJI_REACTION_OPTIONS,
  getEmojiReactionOptionMetadata,
} from '../../core/models/session.models';
import { EmojiReactionPaletteComponent } from './emoji-reaction-palette.component';

describe('EmojiReactionPaletteComponent', () => {
  it('renders the positive reaction options with send labels', async () => {
    await render(EmojiReactionPaletteComponent, {
      inputs: { open: true },
    });

    for (const emoji of EMOJI_REACTION_OPTIONS) {
      const label = getEmojiReactionOptionMetadata(emoji)?.label;
      expect(screen.getByRole('button', { name: `Send ${label} reaction` })).toBeInTheDocument();
    }
  });
});
