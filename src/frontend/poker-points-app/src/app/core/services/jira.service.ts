import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Story } from '../models/session.models';

export interface JiraSuggestion {
  id: string;
  key: string;
  summary: string;
}
export interface JiraField {
  id: string;
  name: string;
}
export interface JiraConnection {
  connected: boolean;
  reconnectRequired: boolean;
  sites: { id: string; name: string; url: string }[] | null;
}
export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  projectId: string;
  issueTypeId: string;
  fieldId: string | null;
  estimate: number | null;
  fields: JiraField[];
  unavailableReason: string | null;
}
export interface JiraLink {
  siteId: string;
  issueId: string;
  key: string;
  fieldId: string | null;
  publishStatus: string;
  message: string | null;
  conflictValue: number | null;
  retryAfter: string | null;
  publishedValue: number | null;
  publishedAt: string | null;
}
export function jiraError(error: unknown): string {
  return error instanceof HttpErrorResponse
    ? (error.error?.error ?? 'The request failed. Try again.')
    : 'The request failed. Try again.';
}

@Injectable({ providedIn: 'root' })
export class JiraService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/integrations/jira`;
  readonly enabled = signal(false);
  constructor() {
    this.http.get<{ enabled: boolean }>(`${this.base}/enabled`).subscribe({
      next: (r) => this.enabled.set(r.enabled),
      error: () => this.enabled.set(false),
    });
  }
  connection() {
    return firstValueFrom(this.http.get<JiraConnection>(`${this.base}/connection`));
  }
  async connect(returnPath: string) {
    const result = await firstValueFrom(
      this.http.post<{ url: string }>(
        `${this.base}/authorize`,
        { returnPath },
        { withCredentials: true },
      ),
    );
    window.location.assign(result.url);
  }
  disconnect() {
    return firstValueFrom(this.http.delete(`${this.base}/connection`));
  }
  projects(siteId: string, startAt = 0) {
    return firstValueFrom(
      this.http.get<{ values: { id: string; name: string; key: string }[]; isLast: boolean }>(
        `${this.base}/projects`,
        { params: { siteId, startAt } },
      ),
    );
  }
  suggestions(siteId: string, query: string) {
    return firstValueFrom(
      this.http.get<JiraSuggestion[]>(`${this.base}/suggestions`, {
        params: { siteId, query },
      }),
    );
  }
  search(siteId: string, projectId: string, jql: string, nextPageToken?: string) {
    return firstValueFrom(
      this.http.post<{ issues: JiraIssue[]; nextPageToken: string | null }>(`${this.base}/search`, {
        siteId,
        projectId,
        jql,
        nextPageToken,
      }),
    );
  }
  import(code: string, siteId: string, issues: { issueId: string; fieldId: string | null }[]) {
    return firstValueFrom(
      this.http.post<{ imported: Story[]; skipped: { issueId: string; reason: string }[] }>(
        `${environment.apiUrl}/sessions/${code}/jira/import`,
        { siteId, issues },
      ),
    );
  }
  estimate(code: string, story: Story, value: number) {
    return firstValueFrom(
      this.http.put<Story>(this.storyUrl(code, story) + '/estimate', {
        value,
        expectedRevision: story.estimateRevision ?? 0,
      }),
    );
  }
  publish(code: string, story: Story, replace = false) {
    return firstValueFrom(
      this.http.post<Story>(this.storyUrl(code, story) + '/jira/publish', {
        expectedRevision: story.estimateRevision ?? 0,
        replace,
        observedValue: story.jira?.conflictValue,
      }),
    );
  }
  fields(story: Story) {
    return firstValueFrom(
      this.http.get<JiraField[]>(`${this.base}/fields`, {
        params: { siteId: story.jira!.siteId, issueId: story.jira!.issueId },
      }),
    );
  }
  map(code: string, story: Story, fieldId: string) {
    return firstValueFrom(
      this.http.put<Story>(this.storyUrl(code, story) + '/jira/field', { fieldId }),
    );
  }
  private storyUrl(code: string, story: Story) {
    return `${environment.apiUrl}/sessions/${code}/stories/${story.id}`;
  }
}
