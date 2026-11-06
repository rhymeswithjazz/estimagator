import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_DATE, ThemeService } from './theme.service';

const october = new Date(2026, 9, 16);
const november = new Date(2026, 10, 1);
const december = new Date(2026, 11, 31);
const january = new Date(2027, 0, 1);

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
    root.classList.remove('dark', 'halloween', 'thanksgiving', 'christmas');
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it.each([
    ['October', october, 'halloween'],
    ['November', november, 'thanksgiving'],
    ['December', december, 'christmas'],
    ['January', january, null],
  ] as const)('offers the %s season in a game', (_month, today, season) => {
    const service = createService(today);
    service.setInGame(true);

    expect(service.availableSeason()).toBe(season);
  });

  it.each([
    ['halloween', october],
    ['thanksgiving', november],
    ['christmas', december],
  ] as const)('applies dark and the %s class when picked in season in a game', (season, today) => {
    localStorage.setItem('poker-points-theme', season);
    const service = createService(today);
    service.setInGame(true);
    TestBed.tick();

    expect(service.activeSeason()).toBe(season);
    expect(service.resolvedTheme()).toBe('dark');
    expect(root.classList).toContain('dark');
    expect(root.classList).toContain(season);
  });

  it('treats an in-season pick as dark outside a game and keeps it saved', () => {
    localStorage.setItem('poker-points-theme', 'thanksgiving');
    const service = createService(november);
    TestBed.tick();

    expect(service.availableSeason()).toBeNull();
    expect(service.effectivePreference()).toBe('dark');
    expect(root.classList).toContain('dark');
    expect(root.classList).not.toContain('thanksgiving');
    expect(localStorage.getItem('poker-points-theme')).toBe('thanksgiving');
  });

  it('treats an out-of-season pick as system and keeps it saved', () => {
    localStorage.setItem('poker-points-theme', 'halloween');
    const service = createService(november);
    service.setInGame(true);
    TestBed.tick();

    expect(service.effectivePreference()).toBe('system');
    expect(service.activeSeason()).toBeNull();
    expect(root.classList).not.toContain('halloween');
    expect(localStorage.getItem('poker-points-theme')).toBe('halloween');
  });

  it('drops the season class when switching back to light', () => {
    const service = createService(december);
    service.setInGame(true);
    service.setPreference('christmas');
    TestBed.tick();
    service.setPreference('light');
    TestBed.tick();

    expect(root.classList).not.toContain('christmas');
    expect(root.classList).not.toContain('dark');
  });
});
