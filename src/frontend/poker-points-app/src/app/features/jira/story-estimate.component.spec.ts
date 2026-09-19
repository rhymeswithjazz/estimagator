import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoryEstimateComponent } from './story-estimate.component';
import { JiraService } from '../../core/services/jira.service';

const story = {
  id: 'one',
  title: 'Story',
  url: null,
  status: 'completed',
  finalScore: 5.5,
  agreedEstimate: null,
  estimateRevision: 0,
};
describe('Story estimate', async () => {
  const jira = { enabled: signal(true), estimate: vi.fn(), publish: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [StoryEstimateComponent],
      providers: [
        { provide: JiraService, useValue: jira },
        { provide: Router, useValue: { url: '/game/ABC123' } },
      ],
    });
  });
  async function create(canManage = true, deck = 'fibonacci') {
    const fixture = TestBed.createComponent(StoryEstimateComponent);
    // Vitest runs JIT without Angular's signal-input compiler transform.
    for (const [key, value] of Object.entries({ story, code: 'ABC123', canManage, deck })) {
      Object.defineProperty(fixture.componentInstance, key, { value: signal(value) });
    }
    fixture.detectChanges();
    return fixture;
  }
  it('keeps average separate and does not auto-confirm or publish', async () => {
    const f = await create();
    expect(f.nativeElement.textContent).toContain('5.5');
    expect(f.nativeElement.textContent).toContain('Not confirmed');
    expect(jira.estimate).not.toHaveBeenCalled();
    expect(jira.publish).not.toHaveBeenCalled();
  });
  it('requires a valid explicit value and accepts zero and half points', async () => {
    const f = await create();
    expect(f.componentInstance.valid()).toBe(false);
    for (const value of [-1, 1000, 1.25, NaN]) {
      f.componentInstance.value = value;
      expect(f.componentInstance.valid()).toBe(false);
    }
    for (const value of [0, 0.5, 5, 999.9]) {
      f.componentInstance.value = value;
      expect(f.componentInstance.valid()).toBe(true);
    }
    f.componentInstance.value = 5;
    jira.estimate.mockResolvedValue({ ...story, agreedEstimate: 5, estimateRevision: 1 });
    await f.componentInstance.save();
    expect(jira.estimate).toHaveBeenCalledWith('ABC123', story, 5);
    expect(jira.publish).not.toHaveBeenCalled();
  });
  it('hides mutation controls from participants', async () => {
    const f = await create(false);
    expect(f.nativeElement.querySelector('[data-testid="confirm-estimate"]')).toBeNull();
  });
  it('does not infer a numerical estimate from a t-shirt deck', async () => {
    const f = await create(true, 'tshirt');
    expect(f.componentInstance.points()).toEqual([]);
    expect(f.componentInstance.value).toBeNull();
  });
});
