import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_DATE, ThemeService } from './theme.service';

const october = new Date(2026, 9, 16);
const november = new Date(2026, 10, 1);

function createService(today: Date): ThemeService {
  TestBed.configureTestingModule({
    providers: [{ provide: CURRENT_DATE, useValue: () => today }],
  });
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  const root = document.documentElement;

  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    root.classList.remove('dark', 'halloween');
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('applies dark and halloween classes when halloween is picked in October in a game', () => {
    localStorage.setItem('poker-points-theme', 'halloween');
    const service = createService(october);
    service.setInGame(true);
    TestBed.tick();

    expect(service.isHalloween()).toBe(true);
    expect(service.resolvedTheme()).toBe('dark');
    expect(root.classList).toContain('dark');
    expect(root.classList).toContain('halloween');
  });

  it('treats a saved halloween pick as dark outside a game and keeps it saved', () => {
    localStorage.setItem('poker-points-theme', 'halloween');
    const service = createService(october);
    TestBed.tick();

    expect(service.halloweenAvailable()).toBe(false);
    expect(service.effectivePreference()).toBe('dark');
    expect(root.classList).toContain('dark');
    expect(root.classList).not.toContain('halloween');
    expect(localStorage.getItem('poker-points-theme')).toBe('halloween');
  });

  it('treats a saved halloween pick as system outside October and keeps it saved', () => {
    localStorage.setItem('poker-points-theme', 'halloween');
    const service = createService(november);
    TestBed.tick();

    service.setInGame(true);
    expect(service.halloweenAvailable()).toBe(false);
    expect(service.effectivePreference()).toBe('system');
    expect(service.isHalloween()).toBe(false);
    expect(root.classList).not.toContain('halloween');
    expect(localStorage.getItem('poker-points-theme')).toBe('halloween');
  });

  it('drops the halloween class when switching back to light', () => {
    const service = createService(october);
    service.setInGame(true);
    service.setPreference('halloween');
    TestBed.tick();
    service.setPreference('light');
    TestBed.tick();

    expect(root.classList).not.toContain('halloween');
    expect(root.classList).not.toContain('dark');
  });
});
