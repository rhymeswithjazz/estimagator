import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import {
  AIRPLANE_THROW_OPTION,
  DART_THROW_OPTION,
  PAPER_BALL_THROW_OPTION,
} from '../../core/models/session.models';
import { EmojiThrowIconComponent } from './emoji-throw-icon.component';

describe('EmojiThrowIconComponent', () => {
  it('renders a custom dart svg for the dart throw option', async () => {
    await render(EmojiThrowIconComponent, {
      inputs: { emoji: DART_THROW_OPTION },
    });

    expect(screen.getByTestId('emoji-throw-icon-dart')).toBeInTheDocument();
  });

  it('renders a custom paper airplane svg for the airplane throw option', async () => {
    await render(EmojiThrowIconComponent, {
      inputs: { emoji: AIRPLANE_THROW_OPTION },
    });

    expect(screen.getByTestId('emoji-throw-icon-airplane')).toBeInTheDocument();
  });

  it('renders a custom paper ball svg for the paper ball throw option', async () => {
    await render(EmojiThrowIconComponent, {
      inputs: { emoji: PAPER_BALL_THROW_OPTION },
    });

    expect(screen.getByTestId('emoji-throw-icon-paper-ball')).toBeInTheDocument();
  });

  it('renders native emoji text for non-custom options', async () => {
    await render(EmojiThrowIconComponent, {
      inputs: { emoji: '❤️' },
    });

    expect(screen.getByText('❤️')).toBeInTheDocument();
  });
});
