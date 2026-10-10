import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JiraImportComponent } from './jira-import.component';
import { JiraService } from '../../core/services/jira.service';

describe('Jira story number search', () => {
  const jira = {
    enabled: signal(true),
    connection: vi.fn(),
    projects: vi.fn(),
    search: vi.fn(),
    suggestions: vi.fn(),
  };
  beforeEach(() => {
    vi.resetAllMocks();
    jira.connection.mockResolvedValue({ connected: true, sites: [{ id: 'site', name: 'Jira' }] });
    jira.search.mockResolvedValue({ issues: [], nextPageToken: null });
    jira.suggestions.mockResolvedValue([]);
    jira.projects.mockResolvedValue({ values: [], isLast: true });
    TestBed.configureTestingModule({
      providers: [
        { provide: JiraService, useValue: jira },
        { provide: Router, useValue: { url: '/game/ABC123' } },
      ],
    });
  });
  function create() {
    return TestBed.runInInjectionContext(() => new JiraImportComponent());
  }
  it('opens without requiring a project lookup', async () => {
    const component = create();
    await component.open();
    expect(component.siteId).toBe('site');
    expect(jira.projects).not.toHaveBeenCalled();
    expect(component.advanced()).toBe(false);
  });
  it('searches partial keys or titles without requiring a full key', async () => {
    const component = create();
    component.siteId = 'site';
    for (const query of ['TEAM-', '123', 'login', '']) {
      component.issueKey = query;
      await component.search();
      expect(jira.suggestions).toHaveBeenLastCalledWith('site', query);
    }
    expect(jira.search).not.toHaveBeenCalled();
  });
  it('retains advanced search and clears previous results when switching', async () => {
    const component = create();
    component.siteId = 'site';
    component.nextPage.set('old-cursor');
    await component.toggleAdvanced();
    expect(jira.projects).toHaveBeenCalledWith('site', 0);
    expect(component.nextPage()).toBeNull();
    component.jql = 'project = TEAM';
    await component.search();
    expect(jira.search).toHaveBeenCalledWith('site', '', 'project = TEAM', undefined);
  });
  it('filters visible choices immediately and debounces requests by 150ms', async () => {
    vi.useFakeTimers();
    try {
      const component = create();
      component.siteId = 'site';
      component.suggestions.set([
        { id: '1', key: 'TEAM-12', summary: 'Login' },
        { id: '2', key: 'TEAM-24', summary: 'Logout' },
      ]);
      component.issueKey = 'TEAM-';
      component.queueSearch();
      expect(component.searching()).toBe(true);
      await vi.advanceTimersByTimeAsync(100);
      component.issueKey = 'TEAM-1';
      component.queueSearch();
      expect(component.suggestions().map((i) => i.key)).toEqual(['TEAM-12']);
      await vi.advanceTimersByTimeAsync(149);
      expect(jira.suggestions).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(jira.suggestions).toHaveBeenCalledExactlyOnceWith('site', 'TEAM-1');
      expect(component.searching()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it('ignores a stale response after the field changes', async () => {
    const component = create();
    component.siteId = 'site';
    component.issueKey = 'TEAM-1';
    let resolve!: (value: unknown) => void;
    jira.suggestions.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const request = component.search();
    component.issueKey = '';
    component.queueSearch();
    resolve([{ id: 'old', key: 'TEAM-1', summary: 'Old' }]);
    await request;
    expect(component.suggestions()).toEqual([]);
    expect(component.message()).toBe('');
    component.close();
    expect(component.searching()).toBe(false);
  });
  it('keeps selected stories when typing another key and cancels on close', async () => {
    vi.useFakeTimers();
    try {
      const component = create();
      component.siteId = 'site';
      const issue = { id: 'one', key: 'TEAM-1' } as any;
      jira.search.mockResolvedValueOnce({ issues: [issue] });
      await component.chooseSuggestion(issue);
      jira.search.mockClear();
      component.issueKey = 'TEAM-2';
      component.queueSearch();
      expect(component.displayedIssues()).toEqual([issue]);
      component.close();
      await vi.advanceTimersByTimeAsync(500);
      expect(jira.search).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
