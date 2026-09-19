import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Story, DECK_VALUES, DeckType } from '../../core/models/session.models';
import { JiraService, JiraField, jiraError } from '../../core/services/jira.service';

@Component({
  selector: 'app-story-estimate',
  imports: [FormsModule, DatePipe],
  template: `
    @if (story().status === 'completed') {
      <section class="border-t border-gray-200 mt-3 pt-3 text-sm text-gray-700" data-testid="story-estimate">
        <p>
          Average: <strong>{{ story().finalScore ?? '—' }}</strong> · Agreed estimate:
          <strong data-testid="agreed-estimate">{{
            story().agreedEstimate ?? 'Not confirmed'
          }}</strong>
        </p>
        @if (canManage()) {
          <div class="flex flex-wrap gap-2 items-center my-2">
            <label [for]="'estimate-' + story().id">Agreed points</label>
            <input
              [id]="'estimate-' + story().id"
              data-testid="estimate-input"
              class="input-field max-w-24 text-sm"
              type="number"
              min="0"
              max="999.9"
              step="0.1"
              [(ngModel)]="value"
            />
            <button
              class="btn-secondary"
              data-testid="confirm-estimate"
              [disabled]="busy() || !valid()"
              (click)="save()"
            >
              Confirm estimate
            </button>
          </div>
          @if (deck() !== 'tshirt') {
            <div class="flex flex-wrap gap-1 my-2" aria-label="Suggested estimates">
              @for (point of points(); track point) {
                <button class="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:bg-poker-green-50 hover:border-poker-green-300 transition-colors" [disabled]="busy()" [attr.aria-pressed]="value === point" (click)="value = point">
                  {{ point }}
                </button>
              }
            </div>
          }
        }
        @if (jira.enabled() && story().jira; as link) {
          <p class="mt-2" data-testid="jira-publish-status">
            {{ link.key }} · {{ statusLabel(link.publishStatus) }}
          </p>
          @if (link.publishedAt) {
            <p class="text-gray-500">
              Last published: {{ link.publishedValue }} points ·
              {{ link.publishedAt | date: 'short' }}
            </p>
          }
          @if (link.message) {
            <p role="status">{{ link.message }}</p>
          }
          @if (link.retryAfter) {
            <p>Retry after {{ link.retryAfter | date: 'medium' }}.</p>
          }
          @if (canManage()) {
            <div class="flex flex-wrap gap-2 mt-2">
              @if (!link.fieldId) {
                <button class="btn-secondary" [disabled]="busy()" (click)="loadFields()">
                  Choose estimation field
                </button>
              }
              @if (link.publishStatus === 'reconnect_required') {
                <button class="btn-secondary" [disabled]="busy()" (click)="connect()">
                  Reconnect Jira
                </button>
              }
              @if (link.publishStatus === 'conflict') {
                <p>
                  Jira currently has {{ link.conflictValue ?? 'no estimate' }}. Replace it with
                  {{ story().agreedEstimate }}?
                </p>
                <button class="btn-primary" [disabled]="busy()" (click)="publish(true)">
                  Replace Jira estimate
                </button>
              } @else {
                <button
                  class="btn-primary"
                  data-testid="publish-jira"
                  [disabled]="busy() || story().agreedEstimate == null || !link.fieldId"
                  (click)="publish()"
                >
                  {{
                    link.publishStatus === 'failed' || link.publishStatus === 'publishing'
                      ? 'Check and retry Jira'
                      : 'Publish to Jira'
                  }}
                </button>
              }
            </div>
            @if (fields().length) {
              <label class="block mt-2"
                >Estimation field
                <select class="input-field text-sm mt-1" [(ngModel)]="fieldId">
                  <option value="">Select a field</option>
                  @for (f of fields(); track f.id) {
                    <option [value]="f.id">{{ f.name }}</option>
                  }
                </select>
              </label>
              <button class="btn-secondary" [disabled]="busy() || !fieldId" (click)="map()">
                Save field
              </button>
            }
          }
        }
        @if (error()) {
          <p role="alert" class="text-red-600 mt-2">{{ error() }}</p>
        }
      </section>
    }
  `,
})
export class StoryEstimateComponent {
  readonly story = input.required<Story>();
  readonly code = input.required<string>();
  readonly deck = input<string>('fibonacci');
  readonly canManage = input(false);
  readonly updated = output<Story>();
  readonly jira = inject(JiraService);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly fields = signal<JiraField[]>([]);
  fieldId = '';
  value: number | null = null;
  readonly points = computed(() =>
    (DECK_VALUES[this.deck() as DeckType] ?? [])
      .map((v) => (v === '½' ? 0.5 : Number(v)))
      .filter(Number.isFinite),
  );
  constructor() {
    effect(() => {
      this.value = this.story().agreedEstimate ?? null;
    });
  }
  valid() {
    return (
      this.value != null &&
      Number.isFinite(this.value) &&
      this.value >= 0 &&
      this.value <= 999.9 &&
      Math.abs(this.value * 10 - Math.round(this.value * 10)) < 1e-8
    );
  }
  statusLabel(status: string) {
    return (
      (
        {
          not_published: 'Not published',
          publishing: 'Publishing or awaiting verification',
          published: 'Published',
          changes_pending: 'Changes pending',
          conflict: 'Needs review',
          failed: 'Publishing failed',
          reconnect_required: 'Reconnect required',
        } as Record<string, string>
      )[status] ?? status
    );
  }
  async save() {
    if (this.valid())
      await this.run(() => this.jira.estimate(this.code(), this.story(), this.value!));
  }
  async publish(replace = false) {
    await this.run(() => this.jira.publish(this.code(), this.story(), replace));
  }
  async map() {
    await this.run(() => this.jira.map(this.code(), this.story(), this.fieldId));
    this.fields.set([]);
  }
  async loadFields() {
    this.error.set('');
    try {
      this.fields.set(await this.jira.fields(this.story()));
      if (!this.fields().length)
        this.error.set(
          'No editable numeric fields are available. Check Jira field configuration and permissions.',
        );
    } catch (e) {
      this.error.set(jiraError(e));
    }
  }
  async connect() {
    try {
      await this.jira.connect(this.router.url.split('?')[0]);
    } catch (e) {
      this.error.set(jiraError(e));
    }
  }
  private async run(action: () => Promise<Story>) {
    this.busy.set(true);
    this.error.set('');
    try {
      this.updated.emit(await action());
    } catch (e) {
      this.error.set(jiraError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
