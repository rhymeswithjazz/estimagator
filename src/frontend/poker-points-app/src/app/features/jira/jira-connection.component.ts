import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { JiraService, JiraConnection, jiraError } from '../../core/services/jira.service';

@Component({
  selector: 'app-jira-connection',
  template: `
    @if (jira.enabled()) {
      <section
        class="glass-card p-6 my-6 text-gray-900"
        aria-label="Jira connection"
      >
        <h2 class="font-display text-xl font-bold text-gray-900">Jira Cloud</h2>
        <p class="text-sm text-gray-600 my-2">
          Connect your account to import stories and publish agreed estimates.
        </p>
        @if (connection()?.connected) {
          <p class="text-sm">
            {{
              connection()?.reconnectRequired
                ? 'Your Jira account needs to be reconnected.'
                : 'Your Jira account is connected.'
            }}
          </p>
        }
        <div class="flex flex-wrap gap-3 my-4">
          <button
            class="btn-primary"
            data-testid="jira-connect"
            [disabled]="busy()"
            (click)="connect()"
          >
            {{ connection()?.connected ? 'Reconnect Jira' : 'Connect Jira' }}
          </button>
          @if (connection()?.connected) {
            <button class="btn-secondary" [disabled]="busy()" (click)="disconnect()">
              Disconnect Jira
            </button>
          }
        </div>
        <p class="text-xs text-gray-500">
          Disconnect removes credentials from Estimagator. To revoke access at Atlassian, visit
          <a
            class="underline"
            href="https://id.atlassian.com/manage-profile/apps"
            target="_blank"
            rel="noopener noreferrer"
            >Connected apps</a
          >.
        </p>
        @if (message()) {
          <p role="status" class="text-sm mt-2">{{ message() }}</p>
        }
      </section>
    }
  `,
})
export class JiraConnectionComponent implements OnInit {
  readonly jira = inject(JiraService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly connection = signal<JiraConnection | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  async ngOnInit() {
    const result = this.route.snapshot.queryParamMap.get('jira');
    if (result)
      this.message.set(
        result === 'connected'
          ? 'Jira connected.'
          : 'Jira connection was not completed. You can try again.',
      );
    try {
      this.connection.set(await this.jira.connection());
    } catch {
      /* Disabled integration has no connection. */
    }
  }
  async connect() {
    this.busy.set(true);
    try {
      await this.jira.connect(this.router.url.split('?')[0]);
    } catch (e) {
      this.message.set(jiraError(e));
      this.busy.set(false);
    }
  }
  async disconnect() {
    this.busy.set(true);
    try {
      await this.jira.disconnect();
      this.connection.set(null);
      this.message.set('Jira disconnected. Imported stories and estimates were kept.');
    } catch (e) {
      this.message.set(jiraError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
