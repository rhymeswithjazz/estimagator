import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  JiraService,
  JiraConnection,
  JiraIssue,
  JiraSuggestion,
  jiraError,
} from '../../core/services/jira.service';

@Component({
  selector: 'app-jira-import',
  imports: [FormsModule],
  template: `
    @if (jira.enabled()) {
      <button class="btn-secondary w-full text-sm my-2" data-testid="jira-import-open" (click)="open()">
        Import from Jira
      </button>
      @if (opened()) {
        <section
          class="rounded-xl border border-gray-200 p-4 my-3 bg-gray-50 text-gray-900 space-y-4"
          aria-label="Import from Jira"
        >
          <div class="flex justify-between">
            <h3 class="font-display font-semibold text-gray-900">Import from Jira</h3>
            <button class="btn-ghost text-sm" aria-label="Close Jira import" (click)="close()">Close</button>
          </div>
          @if (!connection()?.connected || connection()?.reconnectRequired) {
            <button class="btn-primary" (click)="connect()">Connect Jira</button>
          } @else {
            <label class="block text-sm font-medium text-gray-700"
              >Jira site
              <select
                [disabled]="busy()"
                class="input-field text-sm mt-1"
                [(ngModel)]="siteId"
                (ngModelChange)="changeSite()"
              >
                <option value="">Select a site</option>
                @for (site of connection()?.sites; track site.id) {
                  <option [value]="site.id">{{ site.name }}</option>
                }
              </select>
            </label>
            <form (ngSubmit)="search()" class="space-y-3">
              @if (!advanced()) {
                <label class="block text-sm font-medium text-gray-700" for="jira-issue-key">
                  Story number
                </label>
                <input id="jira-issue-key" name="issueKey" class="input-field text-sm"
                  data-testid="jira-issue-key" [(ngModel)]="issueKey"
                  (ngModelChange)="queueSearch()" [disabled]="busy()"
                  role="combobox" aria-autocomplete="list" aria-controls="jira-suggestions"
                  [attr.aria-expanded]="suggestions().length > 0"
                  [attr.aria-activedescendant]="activeSuggestion() >= 0 ? 'jira-option-' + activeSuggestion() : null"
                  (keydown)="onSuggestionKey($event)"
                  placeholder="Story number or title" maxlength="100" autocomplete="off" />
                <p class="text-xs text-gray-500">Type part of a story number or title to narrow the list.</p>
                @if (searching()) {
                  <p role="status" class="flex items-center gap-2 text-xs text-gray-500">
                    <span aria-hidden="true" class="inline-block h-4 w-4 rounded-full border-2 border-gray-200 border-t-poker-green-600 animate-spin motion-reduce:animate-none"></span>
                    Searching Jira…
                  </p>
                }
                @if (suggestions().length) {
                  <div id="jira-suggestions" role="listbox" aria-label="Matching Jira stories"
                    class="border border-gray-200 bg-white rounded-xl overflow-auto max-h-64">
                    @for (issue of suggestions(); track issue.id; let index = $index) {
                      <button type="button" role="option" [id]="'jira-option-' + index"
                        [attr.aria-selected]="activeSuggestion() === index"
                        [class.bg-poker-green-50]="activeSuggestion() === index"
                        class="block w-full px-3 py-3 text-left text-sm hover:bg-poker-green-50 disabled:opacity-50" [disabled]="busy()"
                        (click)="chooseSuggestion(issue)">
                        <span class="font-semibold text-poker-green-700">{{ issue.key }}</span>
                        <span class="block truncate text-gray-500 text-xs mt-1" [title]="issue.summary">{{ issue.summary }}</span>
                      </button>
                    }
                  </div>
                }
              }
            @if (advanced()) {
            <label class="block text-sm font-medium text-gray-700"
              >Project
              <select
                [disabled]="busy()"
                class="input-field text-sm mt-1"
                name="projectId"
                [(ngModel)]="projectId"
                (ngModelChange)="resetSearch()"
              >
                <option value="">Select a project</option>
                @for (project of projects(); track project.id) {
                  <option [value]="project.id">{{ project.key }} — {{ project.name }}</option>
                }
              </select>
            </label>
            @if (moreProjects()) {
              <button type="button" class="btn-ghost text-xs" [disabled]="busy()" (click)="loadProjects()">
                More projects
              </button>
            }
            <label class="block text-sm"
              >Advanced JQL (optional; overrides project selection)
              <textarea
                [disabled]="busy()"
                class="input-field text-sm mt-1"
                data-testid="jira-jql"
                name="jql"
                [(ngModel)]="jql"
                (ngModelChange)="resetSearch()"
                placeholder="project = TEAM AND issuetype = Story"
              ></textarea>
            </label>
            }
              @if (advanced()) {
              <button type="submit" class="btn-primary w-full text-sm" data-testid="jira-search"
                [disabled]="busy() || !siteId || (advanced() ? (!projectId && !jql.trim()) : !issueKey.trim())">
                {{ busy() ? 'Searching…' : 'Find story' }}
              </button>
              }
            </form>
            <button class="btn-ghost text-xs" [disabled]="busy()" (click)="toggleAdvanced()"
              [attr.aria-expanded]="advanced()">
              {{ advanced() ? 'Search by story number' : 'Advanced search' }}
            </button>
            @for (issue of displayedIssues(); track issue.id) {
              <div class="border border-gray-200 bg-white rounded-xl p-3">
                <label class="flex items-start gap-3 cursor-pointer"
                  ><input
                    class="mt-1 accent-poker-green-600"
                    type="checkbox"
                    [disabled]="busy()"
                    [checked]="selected.has(issue.id)"
                    (change)="toggle(issue)"
                    [attr.data-testid]="'jira-select-' + issue.key"
                  />
                  <span
                    ><strong>{{ issue.key }}</strong> {{ issue.summary }}<br /><span
                      class="text-xs text-gray-500"
                      >{{ issue.status }} · Jira estimate: {{ issue.estimate ?? 'None' }}</span
                    ></span
                  >
                </label>
                @if (issue.fields.length > 1 || !issue.fieldId) {
                  <label class="block text-xs mt-2"
                    >Estimation field
                    <select
                      [disabled]="busy()"
                      class="input-field text-sm mt-1"
                      [(ngModel)]="issue.fieldId"
                    >
                      <option [ngValue]="null">Use suggested field, or choose later</option>
                      @for (field of issue.fields; track field.id) {
                        <option [value]="field.id">{{ field.name }}</option>
                      }
                    </select>
                  </label>
                }
                @if (issue.unavailableReason) {
                  <p class="text-xs mt-1">{{ issue.unavailableReason }}</p>
                }
              </div>
            }
            @if (nextPage()) {
              <button class="btn-secondary" [disabled]="busy()" (click)="search(true)">
                More results
              </button>
            }
            <p class="text-xs text-gray-600">
              Selected issue summaries and links will be shared with anyone who has this session’s
              access code.
            </p>
            <button
              class="btn-primary"
              data-testid="jira-import-selected"
              [disabled]="busy() || selected.size === 0"
              (click)="importSelected()"
            >
              Import {{ selected.size }} selected
            </button>
          }
          @if (busy()) {
            <p role="status">Working…</p>
          }
          @if (message()) {
            <p role="status" class="text-sm whitespace-pre-line">{{ message() }}</p>
          }
        </section>
      }
    }
  `,
})
export class JiraImportComponent {
  readonly code = input.required<string>();
  readonly jira = inject(JiraService);
  private readonly router = inject(Router);
  readonly opened = signal(false);
  readonly connection = signal<JiraConnection | null>(null);
  readonly projects = signal<{ id: string; name: string; key: string }[]>([]);
  readonly moreProjects = signal(false);
  readonly results = signal<JiraIssue[]>([]);
  readonly nextPage = signal<string | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  selected = new Map<string, JiraIssue>();
  siteId = '';
  projectId = '';
  jql = '';
  issueKey = '';
  readonly advanced = signal(false);
  readonly searching = signal(false);
  readonly suggestions = signal<JiraSuggestion[]>([]);
  readonly activeSuggestion = signal(-1);
  private timer?: ReturnType<typeof setTimeout>;
  private searchVersion = 0;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelSearch());
  }
  private cancelSearch() {
    clearTimeout(this.timer);
    this.searchVersion++;
    this.searching.set(false);
    this.activeSuggestion.set(-1);
  }
  close() {
    this.cancelSearch();
    this.opened.set(false);
    this.suggestions.set([]);
  }
  displayedIssues() {
    return this.advanced() ? this.results() : [...this.selected.values()];
  }
  queueSearch() {
    this.cancelSearch();
    const query = this.issueKey.trim().toLowerCase();
    this.suggestions.update((items) => items.filter((issue) =>
      `${issue.key} ${issue.summary}`.toLowerCase().includes(query)));
    this.message.set('');
    this.nextPage.set(null);
    if (!this.siteId) return;
    this.searching.set(true);
    this.timer = setTimeout(() => void this.search(), 150);
  }
  async chooseSuggestion(issue: JiraSuggestion) {
    if (this.busy()) return;
    this.cancelSearch();
    await this.run(async () => {
      const result = await this.jira.search(this.siteId, '', `key = ${JSON.stringify(issue.key)}`);
      const detail = result.issues.find((item) => item.id === issue.id);
      if (!detail) { this.message.set('This story is no longer available.'); return; }
      this.selected.set(detail.id, detail);
      this.suggestions.update((items) => items.filter((item) => item.id !== detail.id));
    });
  }
  onSuggestionKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelSearch();
      this.suggestions.set([]);
    } else if (['ArrowDown', 'ArrowUp'].includes(event.key) && this.suggestions().length) {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      this.activeSuggestion.set((this.activeSuggestion() + direction + this.suggestions().length) % this.suggestions().length);
    } else if (event.key === 'Enter' && !this.advanced()) {
      event.preventDefault();
      const issue = this.suggestions()[Math.max(0, this.activeSuggestion())];
      if (issue) this.chooseSuggestion(issue);
    }
  }
  async toggleAdvanced() {
    this.advanced.update((value) => !value);
    this.resetSearch();
    if (this.advanced() && this.siteId && !this.projects().length) await this.loadProjects();
    else if (!this.advanced() && this.siteId) this.queueSearch();
  }
  async open() {
    this.opened.set(true);
    await this.run(async () => {
      this.connection.set(await this.jira.connection());
      const sites = this.connection()?.sites;
      if (sites?.length === 1) {
        this.siteId = sites[0].id;
        await this.changeSite();
      }
    });
  }
  async connect() {
    await this.run(() => this.jira.connect(this.router.url.split('?')[0]));
  }
  async changeSite() {
    this.cancelSearch();
    this.suggestions.set([]);
    this.projectId = '';
    this.projects.set([]);
    this.results.set([]);
    this.selected.clear();
    this.nextPage.set(null);
    if (this.siteId && this.advanced()) await this.loadProjects();
    else if (this.siteId) this.queueSearch();
  }
  async loadProjects() {
    await this.run(async () => {
      const result = await this.jira.projects(this.siteId, this.projects().length);
      this.projects.update((p) => [...p, ...result.values]);
      this.moreProjects.set(!result.isLast);
    });
  }
  resetSearch() {
    this.cancelSearch();
    this.suggestions.set([]);
    this.results.set([]);
    this.selected.clear();
    this.nextPage.set(null);
  }
  async search(more = false) {
    if (this.busy() || !this.siteId) return;
    const key = this.issueKey.trim().toUpperCase();
    if (!this.advanced()) {
      this.cancelSearch();
      const version = this.searchVersion;
      this.searching.set(true);
      this.message.set('');
      try {
        const result = await this.jira.suggestions(this.siteId, this.issueKey.trim());
        if (version !== this.searchVersion) return;
        this.suggestions.set(result.filter((issue) => !this.selected.has(issue.id)));
        if (!this.suggestions().length) this.message.set('No matching stories. Try another number or title.');
      } catch (error) {
        if (version === this.searchVersion) this.message.set(jiraError(error));
      } finally {
        if (version === this.searchVersion) this.searching.set(false);
      }
      return;
    }
    await this.run(async () => {
      if (!more) {
        this.results.set([]);
        this.selected.clear();
      }
      const result = await this.jira.search(
        this.siteId,
        this.advanced() ? this.projectId : '',
        this.advanced() ? this.jql : `key = "${key}"`,
        more ? (this.nextPage() ?? undefined) : undefined,
      );
      this.results.update((old) => [
        ...old,
        ...result.issues.filter((i) => !old.some((o) => o.id === i.id)),
      ]);
      this.nextPage.set(result.nextPageToken);
      if (!this.results().length) this.message.set('No matching issues.');
    });
  }
  toggle(issue: JiraIssue) {
    if (this.selected.has(issue.id)) this.selected.delete(issue.id);
    else this.selected.set(issue.id, issue);
  }
  async importSelected() {
    this.cancelSearch();
    this.suggestions.set([]);
    this.results.set([]);
    await this.run(async () => {
      const result = await this.jira.import(
        this.code(),
        this.siteId,
        [...this.selected.values()].map((i) => ({
          issueId: i.id,
          fieldId: i.fields.some((f) => f.id === i.fieldId) ? i.fieldId : null,
        })),
      );
      this.message.set(
        `${result.imported.length} imported, ${result.skipped.length} skipped.` +
          result.skipped.map((s) => `\n${s.issueId}: ${s.reason}`).join(''),
      );
      this.selected.clear();
    });
  }
  private async run(action: () => Promise<void>) {
    this.busy.set(true);
    this.message.set('');
    try {
      await action();
    } catch (e) {
      this.message.set(jiraError(e));
      if (e instanceof HttpErrorResponse && e.error?.code === 'reconnect_required') {
        this.connection.update((connection) =>
          connection ? { ...connection, reconnectRequired: true } : connection,
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
