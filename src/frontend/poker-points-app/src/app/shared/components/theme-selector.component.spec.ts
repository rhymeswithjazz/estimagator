import { render, screen } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_DATE } from '../../core/services/theme.service';
import { ThemeSelectorComponent } from './theme-selector.component';

const october = new Date(2026, 9, 16);
const november = new Date(2026, 10, 1);

function renderSelector(today: Date) {
  return render(ThemeSelectorComponent, {
    providers: [{ provide: CURRENT_DATE, useValue: () => today }],
  });
}

describe('ThemeSelectorComponent', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'halloween');
    vi.unstubAllGlobals();
  });

  it('shows the Halloween button in October', async () => {
    await renderSelector(october);

    expect(screen.getByRole('button', { name: 'Use Halloween theme' })).toBeInTheDocument();
  });

  it('hides it outside October and marks System active for a saved halloween pick', async () => {
    localStorage.setItem('poker-points-theme', 'halloween');
    await renderSelector(november);

    expect(screen.queryByRole('button', { name: 'Use Halloween theme' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Use system theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
